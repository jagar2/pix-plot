"""
Processes APPROVED applications by running the Playwright form submitter.
Only submits when the job passed the eligibility check:
  - is_public_apply=True
  - requires_login=False
  - has_captcha=False

Called by the APScheduler every 5 minutes and directly after user approval.
"""
from __future__ import annotations

import asyncio
import logging
import os

# Set browser path before Playwright is imported
from app.config import settings
os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", settings.playwright_browsers_path)
from datetime import datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import AsyncSessionLocal
from app.models import Application, ApplicationStatus, CandidateProfile, Job, JobStatus

logger = logging.getLogger(__name__)

_submission_lock = asyncio.Lock()


async def submit_one(application_id: int) -> dict:
    """Submit a single approved application. Returns a result dict."""
    async with AsyncSessionLocal() as db:
        app = (
            await db.execute(
                select(Application)
                .options(selectinload(Application.job).selectinload(Job.company))
                .where(Application.id == application_id)
            )
        ).scalar_one_or_none()

        if not app:
            return {"success": False, "error": "Application not found"}

        if app.status != ApplicationStatus.APPROVED:
            return {"success": False, "error": f"Wrong status: {app.status}"}

        job = app.job
        if not job:
            return {"success": False, "error": "Job not found"}

        # Hard compliance gates — never submit if ineligible
        if not job.is_public_apply:
            app.status = ApplicationStatus.SKIPPED
            app.error_message = "Skipped: application page is not public"
            await db.commit()
            return {"success": False, "error": app.error_message}

        if job.requires_login:
            app.status = ApplicationStatus.SKIPPED
            app.error_message = "Skipped: application page requires login"
            await db.commit()
            return {"success": False, "error": app.error_message}

        if job.has_captcha:
            app.status = ApplicationStatus.SKIPPED
            app.error_message = "Skipped: application page has CAPTCHA"
            await db.commit()
            return {"success": False, "error": app.error_message}

        profile = (
            await db.execute(select(CandidateProfile).limit(1))
        ).scalar_one_or_none()

        if not profile:
            return {"success": False, "error": "No candidate profile configured"}

        # Mark as submitting
        app.status = ApplicationStatus.SUBMITTING
        await db.commit()

    # Run Playwright outside the DB session (long-running I/O)
    from app.services.applicator import submit_application

    profile_dict = {
        "full_name": profile.full_name,
        "email": profile.email,
        "phone": profile.phone,
        "linkedin_url": profile.linkedin_url,
        "github_url": profile.github_url,
        "portfolio_url": profile.portfolio_url,
        "location_city": profile.location_city,
        "location_state": profile.location_state,
        "min_salary": profile.min_salary,
        "experience_years": profile.experience_years,
    }

    resume_path = _find_resume(profile.resume_filename)
    answers = app.answers or {}

    result = await submit_application(
        apply_url=job.apply_url,
        profile=profile_dict,
        answers=answers,
        cover_letter=app.cover_letter or "",
        resume_path=resume_path,
        job_id=job.id,
        dry_run=False,
    )

    # Persist result
    async with AsyncSessionLocal() as db:
        app = (await db.execute(
            select(Application).where(Application.id == application_id)
        )).scalar_one_or_none()
        if not app:
            return {"success": False, "error": "Application lost after submission"}

        if result.success:
            app.status = ApplicationStatus.SUBMITTED
            app.submitted_at = result.submitted_at or datetime.utcnow()
            app.error_message = None
            # Mark the job as applied
            job_row = (await db.execute(select(Job).where(Job.id == app.job_id))).scalar_one_or_none()
            if job_row:
                job_row.status = JobStatus.APPLIED
        else:
            app.status = ApplicationStatus.FAILED
            app.error_message = result.error_message or "Unknown submission error"

        app.updated_at = datetime.utcnow()
        await db.commit()

    logger.info(
        "Application %d → %s | job=%d url=%s error=%s",
        application_id,
        "SUBMITTED" if result.success else "FAILED",
        job.id,
        job.apply_url,
        result.error_message,
    )
    return {
        "success": result.success,
        "application_id": application_id,
        "screenshot": result.screenshot_path,
        "error": result.error_message,
    }


async def process_approved_queue() -> dict:
    """Process all APPROVED applications. Called by the scheduler every 5 min."""
    async with _submission_lock:
        async with AsyncSessionLocal() as db:
            pending = (
                await db.execute(
                    select(Application.id).where(
                        Application.status == ApplicationStatus.APPROVED
                    )
                )
            ).scalars().all()

        if not pending:
            return {"processed": 0, "submitted": 0, "failed": 0}

        logger.info("Processing %d approved applications", len(pending))
        submitted = failed = 0

        for app_id in pending:
            try:
                r = await submit_one(app_id)
                if r["success"]:
                    submitted += 1
                else:
                    failed += 1
            except Exception as e:
                logger.error("Submission error for app %d: %s", app_id, e)
                failed += 1
            # Polite delay between submissions
            await asyncio.sleep(3)

        return {"processed": len(pending), "submitted": submitted, "failed": failed}


def _find_resume(filename: Optional[str]) -> Optional[str]:
    if not filename:
        return None
    candidates = [
        os.path.join("resumes", filename),
        os.path.join("/app/resumes", filename),
        filename,
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None
