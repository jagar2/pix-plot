from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    app_name: str = "JobPilot AutoApply USA"
    debug: bool = False
    database_url: str = "sqlite+aiosqlite:///./jobpilot.db"
    redis_url: str = "redis://localhost:6379/0"
    anthropic_api_key: str = ""
    secret_key: str = "change-me-in-production-use-256-bit-random-key"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    scan_interval_minutes: int = 60
    max_concurrent_scrapers: int = 5
    user_agent: str = "Mozilla/5.0 (compatible; JobPilotBot/1.0; +https://jobpilot.example.com/bot)"
    respect_robots_txt: bool = True
    request_delay_seconds: float = 2.0
    max_applications_per_day: int = 50
    playwright_browsers_path: str = "/opt/pw-browsers"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
