"""Application review and management routes."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Application, ApplicationStatus, Job, JobStatus
from app.schemas import ApplicationDecision, ApplicationRead, ApplicationUpdate, PaginatedResponse

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("", response_model=PaginatedResponse[ApplicationRead])
async def list_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    app_status: Optional[ApplicationStatus] = Query(None, alias="status"),
    job_id: Optional[int] = Query(None),
    submitted_after: Optional[datetime] = None,
    submitted_before: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ApplicationRead]:
    q = select(Application).options(
        selectinload(Application.job).selectinload(Job.company)
    )
    if app_status:
        q = q.where(Application.status == app_status)
    if job_id is not None:
        q = q.where(Application.job_id == job_id)
    if submitted_after:
        q = q.where(Application.submitted_at >= submitted_after)
    if submitted_before:
        q = q.where(Application.submitted_at <= submitted_before)

    total_q = select(func.count()).select_from(q.subquery())
    total: int = (await db.execute(total_q)).scalar_one()

    q = q.order_by(Application.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return PaginatedResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{application_id}", response_model=ApplicationRead)
async def get_application(
    application_id: int,
    db: AsyncSession = Depends(get_db),
) -> Application:
    app = (
        await db.execute(
            select(Application)
            .options(selectinload(Application.job).selectinload(Job.company))
            .where(Application.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return app


@router.patch("/{application_id}", response_model=ApplicationRead)
async def update_application(
    application_id: int,
    body: ApplicationUpdate,
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Update cover letter, resume notes, answers, or status of an application."""
    app = (
        await db.execute(
            select(Application)
            .options(selectinload(Application.job).selectinload(Job.company))
            .where(Application.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(app, field, value)
    app.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(app)
    return app


@router.post("/{application_id}/approve", response_model=ApplicationRead)
async def approve_application(
    application_id: int,
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Approve an application — immediately queues it for submission."""
    return await _decide(application_id, approved=True, reason=None, db=db)


@router.post("/{application_id}/retry", response_model=dict)
async def retry_application(
    application_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-queue a FAILED application for submission."""
    app = (await db.execute(select(Application).where(Application.id == application_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != ApplicationStatus.FAILED:
        raise HTTPException(status_code=409, detail="Only FAILED applications can be retried")
    app.status = ApplicationStatus.APPROVED
    app.error_message = None
    app.updated_at = datetime.utcnow()
    await db.commit()

    import asyncio
    from app.services.submission_worker import submit_one
    asyncio.get_event_loop().create_task(submit_one(application_id))
    return {"message": "Queued for retry", "application_id": application_id}


@router.post("/{application_id}/reject", response_model=ApplicationRead)
async def reject_application(
    application_id: int,
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Reject an application."""
    return await _decide(application_id, approved=False, reason=None, db=db)


@router.post("/{application_id}/decide", response_model=ApplicationRead)
async def decide_application(
    application_id: int,
    body: ApplicationDecision,
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Approve or reject an application pending review."""
    app = (
        await db.execute(
            select(Application)
            .options(selectinload(Application.job).selectinload(Job.company))
            .where(Application.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    if app.status not in (ApplicationStatus.PENDING_REVIEW, ApplicationStatus.FAILED):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot decide on application in status '{app.status}'",
        )

    if body.approved:
        app.status = ApplicationStatus.APPROVED
    else:
        app.status = ApplicationStatus.REJECTED_BY_USER
        if body.reason:
            app.error_message = f"Rejected by user: {body.reason}"
        if app.job:
            app.job.status = JobStatus.SKIPPED

    app.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(app)
    return app


async def _decide(application_id: int, approved: bool, reason: Optional[str], db: AsyncSession) -> Application:
    # uses selectinload from top-level import
    app = (
        await db.execute(
            select(Application)
            .options(selectinload(Application.job).selectinload(Job.company))
            .where(Application.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status not in (ApplicationStatus.PENDING_REVIEW, ApplicationStatus.FAILED):
        raise HTTPException(status_code=409, detail=f"Cannot decide on application in status '{app.status}'")
    if approved:
        app.status = ApplicationStatus.APPROVED
    else:
        app.status = ApplicationStatus.REJECTED_BY_USER
        if reason:
            app.error_message = f"Rejected by user: {reason}"
        if app.job:
            app.job.status = JobStatus.SKIPPED
    app.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(app)

    # Fire-and-forget: kick off submission immediately after approval
    if approved:
        import asyncio
        from app.services.submission_worker import submit_one
        asyncio.get_event_loop().create_task(submit_one(application_id))

    return app


@router.post("/{application_id}/regenerate-cover-letter", response_model=ApplicationRead)
async def regenerate_cover_letter(
    application_id: int,
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Re-generate the cover letter for an application using the current profile."""
    from app.models import CandidateProfile
    from app.services.ai_service import generate_cover_letter

    app = (
        await db.execute(
            select(Application)
            .options(selectinload(Application.job).selectinload(Job.company))
            .where(Application.id == application_id)
        )
    ).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    profile = (
        await db.execute(select(CandidateProfile).limit(1))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="No candidate profile found")

    job = app.job
    job_dict = {
        "title": job.title,
        "company_name": job.company.name if job.company else "",
        "description": job.description,
        "requirements": job.requirements,
    }
    profile_dict = {
        "full_name": profile.full_name,
        "skills": profile.skills or [],
        "experience_years": profile.experience_years,
        "work_history": profile.work_history or [],
    }
    match_dict = {
        "strengths": [],
        "recommended_highlights": [],
    }

    cover_letter = generate_cover_letter(job_dict, profile_dict, match_dict)
    app.cover_letter = cover_letter
    app.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(app)
    return app
