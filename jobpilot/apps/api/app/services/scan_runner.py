"""
Orchestrates scanning companies, persisting new jobs, running AI matching,
and creating applications when the match score threshold is met.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models import (
    Application,
    ApplicationStatus,
    CandidateProfile,
    Company,
    Job,
    JobStatus,
    ScanHistory,
)
from app.services.scanner import scan_company, detect_application_eligibility
from app.services.ai_service import match_job, generate_cover_letter

logger = logging.getLogger(__name__)

_scan_lock = asyncio.Lock()
_is_scanning = False
_next_scan_at: Optional[datetime] = None
_last_scan_at: Optional[datetime] = None


def scanner_state() -> dict:
    return {
        "is_scanning": _is_scanning,
        "next_scan_at": _next_scan_at.isoformat() if _next_scan_at else None,
        "last_scan_at": _last_scan_at.isoformat() if _last_scan_at else None,
    }


async def run_company_scan(company_id: int, db: AsyncSession) -> dict:
    """Scan one company and persist new jobs. Returns ScanResult dict."""
    company = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if not company or not company.is_active:
        return {"company_id": company_id, "jobs_found": 0, "jobs_new": 0, "jobs_matched": 0, "errors": []}

    errors = []
    try:
        raw_jobs = await scan_company(
            company_id=company_id,
            career_page_url=company.career_page_url,
            ats_type=company.ats_type.value if company.ats_type else None,
            ats_job_board_url=company.ats_job_board_url,
        )
    except Exception as e:
        logger.error("Scan error company %s: %s", company_id, e)
        errors.append(str(e))
        company.scan_error_count = (company.scan_error_count or 0) + 1
        await db.commit()
        return {"company_id": company_id, "jobs_found": 0, "jobs_new": 0, "jobs_matched": 0, "errors": errors}

    jobs_found = len(raw_jobs)
    jobs_new = 0
    jobs_matched = 0

    profile = (await db.execute(select(CandidateProfile).limit(1))).scalar_one_or_none()

    for raw in raw_jobs:
        ext_id = str(raw.get("external_id") or "")
        if not ext_id:
            continue

        existing = (
            await db.execute(
                select(Job).where(Job.company_id == company_id, Job.external_id == ext_id)
            )
        ).scalar_one_or_none()

        if existing:
            continue

        job = Job(
            company_id=company_id,
            external_id=ext_id,
            title=raw.get("title") or "",
            department=raw.get("department"),
            location=raw.get("location"),
            remote_type=raw.get("remote_type"),
            description=raw.get("description"),
            requirements=raw.get("requirements"),
            salary_min=raw.get("salary_min"),
            salary_max=raw.get("salary_max"),
            apply_url=raw.get("apply_url") or "",
            posted_at=raw.get("posted_at"),
            extra_meta=raw.get("extra_meta"),
            status=JobStatus.NEW,
        )
        db.add(job)
        await db.flush()
        jobs_new += 1

        # Eligibility: known public ATS APIs don't need a Playwright check.
        # Only run the slow browser check for generic/unknown job pages.
        known_public_ats = {"greenhouse", "lever", "ashby", "smartrecruiters"}
        ats_lower = (company.ats_type.value if company.ats_type else "").lower()
        if ats_lower in known_public_ats:
            job.is_public_apply = True
            job.requires_login = False
            job.has_captcha = False
        elif job.apply_url:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10) as client:
                    eligibility = await detect_application_eligibility(job.apply_url, client)
                job.is_public_apply = eligibility["is_public_apply"]
                job.requires_login = eligibility["requires_login"]
                job.has_captcha = eligibility["has_captcha"]
            except Exception as e:
                logger.debug("Eligibility check failed for %s: %s — assuming public", job.apply_url, e)
                job.is_public_apply = True
                job.requires_login = False

        # AI matching — works with or without resume_text
        if profile:
            try:
                job_dict = {
                    "title": job.title,
                    "company_name": company.name,
                    "location": job.location,
                    "description": job.description or "",
                    "requirements": job.requirements or "",
                    "remote_type": job.remote_type,
                }
                profile_dict = {
                    "full_name": profile.full_name,
                    "skills": profile.skills or [],
                    "experience_years": profile.experience_years,
                    "target_roles": profile.target_roles or [],
                    "education": profile.education or [],
                    "work_history": profile.work_history or [],
                    "open_to_remote": profile.open_to_remote,
                    "location_city": profile.location_city,
                    "location_state": profile.location_state,
                    "min_salary": profile.min_salary,
                    "resume_text": (profile.resume_text or "")[:3000],
                }
                match_result = match_job(job_dict, profile_dict)
                score = match_result.get("score", 0.0)
                job.match_score = score

                if score >= profile.min_match_score:
                    job.status = JobStatus.MATCHED
                    jobs_matched += 1

                    if job.is_public_apply and not job.requires_login and not job.has_captcha:
                        cover = generate_cover_letter(job_dict, profile_dict, match_result)
                        app_status = (
                            ApplicationStatus.APPROVED
                            if score >= profile.auto_approve_threshold
                            else ApplicationStatus.PENDING_REVIEW
                        )
                        app = Application(
                            job_id=job.id,
                            status=app_status,
                            cover_letter=cover,
                            match_explanation=match_result.get("explanation"),
                            tailored_resume_notes="\n".join(match_result.get("strengths", [])),
                            answers=match_result.get("suggested_answers"),
                        )
                        db.add(app)
                else:
                    job.status = JobStatus.LOW_MATCH if score > 0 else JobStatus.NEW
            except Exception as e:
                logger.error("AI matching failed for job %s: %s", job.id, e)

    company.last_scanned_at = datetime.utcnow()
    company.scan_error_count = 0
    await db.commit()

    return {
        "company_id": company_id,
        "jobs_found": jobs_found,
        "jobs_new": jobs_new,
        "jobs_matched": jobs_matched,
        "errors": errors,
    }


async def run_all_companies_scan() -> dict:
    """Full hourly scan: all active companies."""
    global _is_scanning, _next_scan_at, _last_scan_at

    async with _scan_lock:
        _is_scanning = True
        _last_scan_at = datetime.utcnow()
        total_found = total_new = total_matched = 0
        all_errors: list[str] = []

        async with AsyncSessionLocal() as db:
            companies = (
                await db.execute(select(Company).where(Company.is_active == True))
            ).scalars().all()

            sem = asyncio.Semaphore(settings.max_concurrent_scrapers)

            async def _scan_one(company: Company):
                nonlocal total_found, total_new, total_matched
                async with sem:
                    async with AsyncSessionLocal() as inner_db:
                        result = await run_company_scan(company.id, inner_db)
                        total_found += result["jobs_found"]
                        total_new += result["jobs_new"]
                        total_matched += result["jobs_matched"]
                        all_errors.extend(result.get("errors", []))

            await asyncio.gather(*[_scan_one(c) for c in companies], return_exceptions=True)

        _is_scanning = False
        _next_scan_at = datetime.utcnow() + timedelta(minutes=settings.scan_interval_minutes)
        return {"jobs_found": total_found, "jobs_new": total_new, "jobs_matched": total_matched, "errors": all_errors}
