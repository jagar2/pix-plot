"""Scanner trigger and history routes."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import ScanHistory
from app.schemas import PaginatedResponse, ScanHistoryRead

router = APIRouter(prefix="/scanner", tags=["scanner"])


@router.get("/status")
async def get_scanner_status() -> dict:
    """Return current scanning state (running, last/next scan times)."""
    from app.services.scan_runner import scanner_state

    return scanner_state()


@router.post("/trigger")
async def trigger_scan(
    background_tasks: BackgroundTasks,
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Trigger a scan in the background.

    Pass ``company_id`` to scan a single company, or omit to scan all active companies.
    """
    from app.services.scan_runner import scanner_state, run_all_companies_scan, run_company_scan

    state = scanner_state()
    if state["is_scanning"]:
        return {"message": "Scan already in progress", "already_running": True}

    if company_id is not None:
        # Verify company exists
        from app.models import Company
        company = (
            await db.execute(select(Company).where(Company.id == company_id))
        ).scalar_one_or_none()
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        async def _run_company() -> None:
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as inner_db:
                await run_company_scan(company_id=company_id, db=inner_db)

        background_tasks.add_task(_run_company)
        return {"message": f"Scan triggered for company {company_id}", "already_running": False}

    background_tasks.add_task(run_all_companies_scan)
    return {"message": "Full scan triggered", "already_running": False}


@router.get("/history", response_model=PaginatedResponse[ScanHistoryRead])
async def scan_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: Optional[int] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[ScanHistoryRead]:
    q = select(ScanHistory)
    if company_id is not None:
        q = q.where(ScanHistory.company_id == company_id)
    if status:
        q = q.where(ScanHistory.status == status)

    total_q = select(func.count()).select_from(q.subquery())
    total: int = (await db.execute(total_q)).scalar_one()

    q = q.order_by(ScanHistory.started_at.desc()).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return PaginatedResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.get("/history/{scan_id}", response_model=ScanHistoryRead)
async def get_scan_result(
    scan_id: int,
    db: AsyncSession = Depends(get_db),
) -> ScanHistory:
    scan = (
        await db.execute(select(ScanHistory).where(ScanHistory.id == scan_id))
    ).scalar_one_or_none()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan record not found")
    return scan
