"""FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger

from app.config import settings
from app.database import init_db, AsyncSessionLocal
from app.api.routes import companies, jobs, applications, profile, scanner, dashboard

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version="1.0.0",
    description="Automated job discovery and application system for US companies.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(applications.router, prefix="/api/v1")
app.include_router(profile.router, prefix="/api/v1")
app.include_router(scanner.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")

_scheduler = AsyncIOScheduler()


@app.on_event("startup")
async def startup():
    await init_db()

    # Seed companies if DB is empty
    from sqlalchemy import select, func
    from app.models import Company
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count()).select_from(Company))).scalar_one()
        if count == 0:
            from app.seed_data import seed_companies
            n = await seed_companies(db)
            logger.info("Seeded %d companies", n)

    # Hourly scanner
    _scheduler.add_job(
        _run_scan,
        trigger=IntervalTrigger(minutes=settings.scan_interval_minutes),
        id="hourly_scan",
        replace_existing=True,
    )
    _scheduler.start()
    logger.info("Scheduler started; scan interval=%d min", settings.scan_interval_minutes)


@app.on_event("shutdown")
async def shutdown():
    _scheduler.shutdown(wait=False)


async def _run_scan():
    from app.services.scan_runner import run_all_companies_scan
    try:
        result = await run_all_companies_scan()
        logger.info("Scheduled scan complete: %s", result)
    except Exception as e:
        logger.error("Scheduled scan error: %s", e)


@app.get("/health")
async def health():
    from app.services.scan_runner import scanner_state
    return {"status": "ok", "app": settings.app_name, "scanner": scanner_state()}
