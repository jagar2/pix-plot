import os
from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SearchConfig:
    keywords: List[str] = field(default_factory=list)
    location: str = ""
    radius_miles: int = 25
    job_type: Optional[str] = None        # fulltime, parttime, contract, internship
    experience_level: Optional[str] = None  # entry_level, mid_level, senior_level
    max_applications: int = 10
    min_salary: Optional[int] = None
    easy_apply_only: bool = False


@dataclass
class AccountConfig:
    email: str = ""
    password: str = ""
    create_if_missing: bool = True


@dataclass
class AgentConfig:
    search: SearchConfig = field(default_factory=SearchConfig)
    account: AccountConfig = field(default_factory=AccountConfig)
    resume_path: str = "templates/resume.txt"
    cover_letter_template_path: str = "templates/cover_letter_template.txt"
    output_dir: str = "output"
    anthropic_api_key: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", ""))
    headless: bool = False
    dry_run: bool = False  # If True, fill forms but don't submit


def load_config_from_env() -> AgentConfig:
    return AgentConfig(
        account=AccountConfig(
            email=os.environ.get("INDEED_EMAIL", ""),
            password=os.environ.get("INDEED_PASSWORD", ""),
        ),
        search=SearchConfig(
            keywords=os.environ.get("JOB_KEYWORDS", "").split(","),
            location=os.environ.get("JOB_LOCATION", ""),
        ),
        anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
    )
