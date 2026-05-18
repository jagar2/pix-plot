"""Company management routes."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Company
from app.schemas import (
    CompanyCreate,
    CompanyRead,
    CompanyUpdate,
    PaginatedResponse,
    ScanResult,
)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=PaginatedResponse[CompanyRead])
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> PaginatedResponse[CompanyRead]:
    q = select(Company)
    if is_active is not None:
        q = q.where(Company.is_active == is_active)
    if search:
        q = q.where(
            Company.name.ilike(f"%{search}%") | Company.domain.ilike(f"%{search}%")
        )

    total_q = select(func.count()).select_from(q.subquery())
    total: int = (await db.execute(total_q)).scalar_one()

    q = q.order_by(Company.name).offset((page - 1) * page_size).limit(page_size)
    rows = (await db.execute(q)).scalars().all()

    return PaginatedResponse(
        items=rows,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, -(-total // page_size)),
    )


@router.post("", response_model=CompanyRead, status_code=status.HTTP_201_CREATED)
async def create_company(
    body: CompanyCreate,
    db: AsyncSession = Depends(get_db),
) -> Company:
    existing = (
        await db.execute(select(Company).where(Company.domain == body.domain))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Company with domain '{body.domain}' already exists",
        )
    company = Company(**body.model_dump())
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(company_id: int, db: AsyncSession = Depends(get_db)) -> Company:
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


@router.patch("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
) -> Company:
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(company, field, value)

    await db.commit()
    await db.refresh(company)
    return company


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(company_id: int, db: AsyncSession = Depends(get_db)) -> None:
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    await db.delete(company)
    await db.commit()


@router.post("/{company_id}/scan", response_model=ScanResult)
async def trigger_company_scan(
    company_id: int,
    db: AsyncSession = Depends(get_db),
) -> ScanResult:
    """Trigger an immediate scan of a single company's job board."""
    company = (
        await db.execute(select(Company).where(Company.id == company_id))
    ).scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    from app.services.scan_runner import run_company_scan
    result = await run_company_scan(company_id=company_id, db=db)
    return result
