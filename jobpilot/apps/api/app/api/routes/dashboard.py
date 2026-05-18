"""Dashboard statistics route."""
from __future__ import annotations
from datetime import datetime, date
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import APIRouter, Depends
from app.database import get_db
from app.models import Company, Job, Application, JobStatus, ApplicationStatus

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
async def get_dashboard_stats(db: AsyncSession = Depends(get_db)) -> dict:
    total_companies = (await db.execute(select(func.count()).select_from(Company))).scalar_one()
    active_companies = (await db.execute(select(func.count()).select_from(Company).where(Company.is_active == True))).scalar_one()
    total_jobs = (await db.execute(select(func.count()).select_from(Job))).scalar_one()
    total_apps = (await db.execute(select(func.count()).select_from(Application))).scalar_one()
    
    submitted = (await db.execute(
        select(func.count()).select_from(Application).where(Application.status == ApplicationStatus.SUBMITTED)
    )).scalar_one()
    pending = (await db.execute(
        select(func.count()).select_from(Application).where(Application.status == ApplicationStatus.PENDING_REVIEW)
    )).scalar_one()
    matched = (await db.execute(
        select(func.count()).select_from(Job).where(Job.status == JobStatus.MATCHED)
    )).scalar_one()
    
    avg_score_row = (await db.execute(
        select(func.avg(Job.match_score)).where(Job.match_score.isnot(None))
    )).scalar_one()

    today_start = datetime.combine(date.today(), datetime.min.time())
    apps_today = (await db.execute(
        select(func.count()).select_from(Application).where(Application.created_at >= today_start)
    )).scalar_one()

    top_jobs_rows = (await db.execute(
        select(Job).where(Job.match_score.isnot(None)).order_by(Job.match_score.desc()).limit(5)
    )).scalars().all()

    from app.services.scan_runner import scanner_state
    state = scanner_state()

    return {
        "total_companies": total_companies,
        "active_companies": active_companies,
        "total_jobs": total_jobs,
        "jobs_matched": matched,
        "total_applications": total_apps,
        "pending_review": pending,
        "applications_submitted": submitted,
        "success_rate": round(submitted / max(total_apps, 1) * 100, 1),
        "avg_match_score": round(float(avg_score_row) * 100, 1) if avg_score_row else None,
        "applications_today": apps_today,
        "scanner": state,
        "top_matching_jobs": [
            {
                "id": j.id,
                "title": j.title,
                "company_id": j.company_id,
                "match_score": j.match_score,
                "status": j.status.value,
                "apply_url": j.apply_url,
            }
            for j in top_jobs_rows
        ],
    }
