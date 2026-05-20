"""Job listing and detail routes."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import Job, JobStatus
from app.schemas import JobRead, JobStatusUpdate, PaginatedResponse

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=PaginatedResponse[JobRead])
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[JobStatus] = None,
    company_id: Optional[int] = None,
    min_match_score: Optional[float] = Query(None, ge=0.0, le=1.0),
    max_match_score: Optional[float] = Query(None, ge=0.0, le=1.0),
    remote_only: Optional[bool] = None,
    posted_after: Optional[datetime] = None,
    posted_before: Optional[datetime] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[JobRead]:
    q = select(Job).options(selectinload(Job.company))

    if status:
        q = q.where(Job.status == status)
    if company_id:
        q = q.where(Job.company_id == company_id)
    if min_match_score is not None:
        q = q.where(Job.match_score >= min_match_score)
    if max_match_score is not None:
        q = q.where(Job.match_score <= max_match_score)
    if remote_only:
        q = q.where(Job.remote_type == "remote")
    if posted_after:
        q = q.where(Job.posted_at >= posted_after)
    if posted_before:
        q = q.where(Job.posted_at <= posted_before)
    if search:
        q = q.where(
            Job.title.ilike(f"%{search}%") | Job.description.ilike(f"%{search}%")
        )

    total_q = select(func.count()).select_from(q.subquery())
    total: int = (await db.execute(total_q)).scalar_one()

    q = (
        q.order_by(Job.match_score.desc().nulls_last(), Job.first_seen_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(q)).scalars().all()

    return PaginatedResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/{job_id}", response_model=JobRead)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)) -> Job:
    job = (
        await db.execute(
            select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.patch("/{job_id}/status", response_model=JobRead)
async def update_job_status(
    job_id: int,
    body: JobStatusUpdate,
    db: AsyncSession = Depends(get_db),
) -> Job:
    job = (
        await db.execute(
            select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job.status = body.status
    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{job_id}/match", response_model=dict)
async def match_job_to_profile(
    job_id: int,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Re-run AI matching for a single job against the active candidate profile."""
    from sqlalchemy import select as sa_select
    from app.models import CandidateProfile
    from app.services.ai_service import match_job

    job = (
        await db.execute(
            select(Job).options(selectinload(Job.company)).where(Job.id == job_id)
        )
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = (
        await db.execute(sa_select(CandidateProfile).limit(1))
    ).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="No candidate profile found")

    job_dict = {
        "title": job.title,
        "company_name": job.company.name if job.company else "",
        "location": job.location,
        "description": job.description,
        "requirements": job.requirements,
    }
    profile_dict = {
        "full_name": profile.full_name,
        "skills": profile.skills,
        "experience_years": profile.experience_years,
        "target_roles": profile.target_roles,
        "education": profile.education,
        "work_history": profile.work_history,
        "open_to_remote": profile.open_to_remote,
        "location_city": profile.location_city,
        "location_state": profile.location_state,
        "min_salary": profile.min_salary,
    }

    match_result = match_job(job_dict, profile_dict)
    job.match_score = match_result.get("score", 0.0)
    await db.commit()
    return match_result
