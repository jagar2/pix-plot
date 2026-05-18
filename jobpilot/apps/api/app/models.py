import enum
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    String, Text, Integer, Float, Boolean, DateTime, ForeignKey,
    Enum as SAEnum, JSON, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class ATSType(str, enum.Enum):
    GREENHOUSE = "greenhouse"
    LEVER = "lever"
    WORKDAY = "workday"
    BAMBOOHR = "bamboohr"
    ICIMS = "icims"
    TALEO = "taleo"
    SMARTRECRUITERS = "smartrecruiters"
    JOBVITE = "jobvite"
    ASHBY = "ashby"
    RIPPLING = "rippling"
    CUSTOM = "custom"
    UNKNOWN = "unknown"


class ApplicationStatus(str, enum.Enum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED_BY_USER = "rejected_by_user"
    SUBMITTING = "submitting"
    SUBMITTED = "submitted"
    FAILED = "failed"
    SKIPPED = "skipped"


class JobStatus(str, enum.Enum):
    NEW = "new"
    MATCHED = "matched"
    LOW_MATCH = "low_match"
    APPLIED = "applied"
    SKIPPED = "skipped"
    INELIGIBLE = "ineligible"


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    career_page_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    ats_type: Mapped[ATSType] = mapped_column(SAEnum(ATSType), default=ATSType.UNKNOWN)
    ats_job_board_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    scan_error_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    extra_meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    jobs: Mapped[list["Job"]] = relationship("Job", back_populates="company")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (UniqueConstraint("company_id", "external_id", name="uq_job_company_external"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    external_id: Mapped[str] = mapped_column(String(512), nullable=False)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    department: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    remote_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    salary_min: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    salary_max: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    apply_url: Mapped[str] = mapped_column(String(1024), nullable=False)
    is_public_apply: Mapped[bool] = mapped_column(Boolean, default=False)
    requires_login: Mapped[bool] = mapped_column(Boolean, default=True)
    has_captcha: Mapped[bool] = mapped_column(Boolean, default=False)
    match_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.NEW)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    extra_meta: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    company: Mapped["Company"] = relationship("Company", back_populates="jobs")
    application: Mapped[Optional["Application"]] = relationship(
        "Application", back_populates="job", uselist=False
    )


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    github_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    portfolio_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    location_city: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location_state: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    willing_to_relocate: Mapped[bool] = mapped_column(Boolean, default=False)
    open_to_remote: Mapped[bool] = mapped_column(Boolean, default=True)
    target_roles: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    target_industries: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    excluded_companies: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    min_salary: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    resume_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    resume_filename: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    skills: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    experience_years: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    education: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    work_history: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    min_match_score: Mapped[float] = mapped_column(Float, default=0.65)
    auto_approve_threshold: Mapped[float] = mapped_column(Float, default=0.85)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Application(Base):
    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), unique=True, nullable=False)
    status: Mapped[ApplicationStatus] = mapped_column(
        SAEnum(ApplicationStatus), default=ApplicationStatus.PENDING_REVIEW
    )
    cover_letter: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tailored_resume_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    match_explanation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    answers: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job: Mapped["Job"] = relationship("Job", back_populates="application")


class ScanHistory(Base):
    __tablename__ = "scan_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[Optional[int]] = mapped_column(ForeignKey("companies.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    jobs_found: Mapped[int] = mapped_column(Integer, default=0)
    jobs_new: Mapped[int] = mapped_column(Integer, default=0)
    jobs_matched: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="running")
