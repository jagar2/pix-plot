from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
from enum import Enum


class ApplicationStatus(Enum):
    PENDING = "pending"
    APPLIED = "applied"
    SKIPPED = "skipped"
    FAILED = "failed"


@dataclass
class JobListing:
    title: str
    company: str
    location: str
    description: str
    url: str
    job_id: str
    easy_apply: bool = False
    salary: Optional[str] = None
    posted_date: Optional[str] = None


@dataclass
class UserProfile:
    full_name: str
    email: str
    phone: str
    location: str
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    years_of_experience: int = 0


@dataclass
class Application:
    job: JobListing
    status: ApplicationStatus = ApplicationStatus.PENDING
    tailored_resume_path: Optional[str] = None
    cover_letter: Optional[str] = None
    applied_at: Optional[datetime] = None
    notes: str = ""
