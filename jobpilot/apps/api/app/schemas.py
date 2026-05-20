from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import ATSType, ApplicationStatus, JobStatus

T = TypeVar("T")


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    pages: int

    model_config = ConfigDict(arbitrary_types_allowed=True)


# ---------------------------------------------------------------------------
# Company schemas
# ---------------------------------------------------------------------------

class CompanyBase(BaseModel):
    name: str = Field(..., max_length=255)
    domain: str = Field(..., max_length=255)
    career_page_url: str = Field(..., max_length=1024)
    ats_type: ATSType = ATSType.UNKNOWN
    ats_job_board_url: Optional[str] = Field(None, max_length=1024)
    is_active: bool = True
    extra_meta: Optional[dict[str, Any]] = None


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    career_page_url: Optional[str] = Field(None, max_length=1024)
    ats_type: Optional[ATSType] = None
    ats_job_board_url: Optional[str] = Field(None, max_length=1024)
    is_active: Optional[bool] = None
    extra_meta: Optional[dict[str, Any]] = None


class CompanyRead(CompanyBase):
    id: int
    last_scanned_at: Optional[datetime] = None
    scan_error_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CompanyBrief(BaseModel):
    id: int
    name: str
    domain: str
    ats_type: ATSType

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Job schemas
# ---------------------------------------------------------------------------

class JobRead(BaseModel):
    id: int
    company_id: int
    external_id: str
    title: str
    department: Optional[str] = None
    location: Optional[str] = None
    remote_type: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    apply_url: str
    is_public_apply: bool
    requires_login: bool
    has_captcha: bool
    match_score: Optional[float] = None
    status: JobStatus
    first_seen_at: datetime
    posted_at: Optional[datetime] = None
    extra_meta: Optional[dict[str, Any]] = None
    company: Optional[CompanyBrief] = None

    model_config = ConfigDict(from_attributes=True)


class JobStatusUpdate(BaseModel):
    status: JobStatus


# ---------------------------------------------------------------------------
# Candidate profile schemas
# ---------------------------------------------------------------------------

class CandidateProfileBase(BaseModel):
    full_name: str = Field(..., max_length=255)
    email: str = Field(..., max_length=255)
    phone: Optional[str] = Field(None, max_length=64)
    linkedin_url: Optional[str] = Field(None, max_length=512)
    github_url: Optional[str] = Field(None, max_length=512)
    portfolio_url: Optional[str] = Field(None, max_length=512)
    location_city: Optional[str] = Field(None, max_length=255)
    location_state: Optional[str] = Field(None, max_length=64)
    willing_to_relocate: bool = False
    open_to_remote: bool = True
    target_roles: Optional[List[str]] = None
    target_industries: Optional[List[str]] = None
    excluded_companies: Optional[List[str]] = None
    min_salary: Optional[float] = None
    skills: Optional[List[str]] = None
    experience_years: Optional[int] = None
    education: Optional[List[dict[str, Any]]] = None
    work_history: Optional[List[dict[str, Any]]] = None
    min_match_score: float = Field(default=0.65, ge=0.0, le=1.0)
    auto_approve_threshold: float = Field(default=0.85, ge=0.0, le=1.0)

    @field_validator("min_match_score", "auto_approve_threshold", mode="before")
    @classmethod
    def clamp_score(cls, v: Any) -> float:
        return max(0.0, min(1.0, float(v)))


class CandidateProfileCreate(CandidateProfileBase):
    pass


class CandidateProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=64)
    linkedin_url: Optional[str] = Field(None, max_length=512)
    github_url: Optional[str] = Field(None, max_length=512)
    portfolio_url: Optional[str] = Field(None, max_length=512)
    location_city: Optional[str] = Field(None, max_length=255)
    location_state: Optional[str] = Field(None, max_length=64)
    willing_to_relocate: Optional[bool] = None
    open_to_remote: Optional[bool] = None
    target_roles: Optional[List[str]] = None
    target_industries: Optional[List[str]] = None
    excluded_companies: Optional[List[str]] = None
    min_salary: Optional[float] = None
    skills: Optional[List[str]] = None
    experience_years: Optional[int] = None
    education: Optional[List[dict[str, Any]]] = None
    work_history: Optional[List[dict[str, Any]]] = None
    min_match_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    auto_approve_threshold: Optional[float] = Field(None, ge=0.0, le=1.0)


class CandidateProfileRead(CandidateProfileBase):
    id: int
    resume_filename: Optional[str] = None
    resume_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Application schemas
# ---------------------------------------------------------------------------

class ApplicationRead(BaseModel):
    id: int
    job_id: int
    status: ApplicationStatus
    cover_letter: Optional[str] = None
    tailored_resume_notes: Optional[str] = None
    match_explanation: Optional[str] = None
    answers: Optional[dict[str, Any]] = None
    submitted_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    job: Optional[JobRead] = None

    model_config = ConfigDict(from_attributes=True)


class ApplicationUpdate(BaseModel):
    """Used by the UI to approve or reject an application."""
    status: ApplicationStatus
    cover_letter: Optional[str] = None
    tailored_resume_notes: Optional[str] = None
    answers: Optional[dict[str, Any]] = None


class ApplicationDecision(BaseModel):
    """Lightweight approve/reject payload."""
    approved: bool
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Scan schemas
# ---------------------------------------------------------------------------

class ScanResult(BaseModel):
    scan_id: int
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    jobs_found: int
    jobs_new: int
    jobs_matched: int
    errors: List[str] = []
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class ScanTriggerRequest(BaseModel):
    company_id: Optional[int] = None  # None means scan all


class ScanHistoryRead(BaseModel):
    id: int
    company_id: Optional[int] = None
    started_at: datetime
    finished_at: Optional[datetime] = None
    jobs_found: int
    jobs_new: int
    jobs_matched: int
    errors: Optional[List[str]] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Dashboard schemas
# ---------------------------------------------------------------------------

class JobStatusCounts(BaseModel):
    new: int = 0
    matched: int = 0
    low_match: int = 0
    applied: int = 0
    skipped: int = 0
    ineligible: int = 0


class ApplicationStatusCounts(BaseModel):
    pending_review: int = 0
    approved: int = 0
    rejected_by_user: int = 0
    submitting: int = 0
    submitted: int = 0
    failed: int = 0
    skipped: int = 0


class DashboardStats(BaseModel):
    total_companies: int
    active_companies: int
    total_jobs: int
    job_statuses: JobStatusCounts
    total_applications: int
    application_statuses: ApplicationStatusCounts
    last_scan_at: Optional[datetime] = None
    applications_today: int = 0
    avg_match_score: Optional[float] = None


# ---------------------------------------------------------------------------
# Resume upload
# ---------------------------------------------------------------------------

class ResumeUploadResponse(BaseModel):
    filename: str
    size_bytes: int
    parsed_skills: List[str] = []
    parsed_experience_years: Optional[int] = None
    parsed_education: List[dict[str, Any]] = []
    parsed_work_history: List[dict[str, Any]] = []
    message: str = "Resume uploaded and parsed successfully"


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str = "1.0.0"
    database: str = "ok"
