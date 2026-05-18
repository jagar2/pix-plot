"""Job board scanner with ATS-specific adapters.

Supported ATS systems:
- Greenhouse  – public JSON API
- Lever       – public JSON API
- Ashby       – public JSON API
- Workday     – Playwright scraping (no public API)
- BambooHR    – Playwright scraping
- iCIMS       – Playwright scraping
- SmartRecruiters – Playwright scraping
- Generic     – Playwright scraping fallback
"""

from __future__ import annotations

import asyncio
import logging
import re
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _robots_allows(url: str, user_agent: str) -> bool:
    """Return True if robots.txt permits fetching the given URL."""
    if not settings.respect_robots_txt:
        return True
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        rp.read()
        return rp.can_fetch(user_agent, url)
    except Exception:
        return True  # If we can't read robots.txt, assume allowed


def _normalize_remote(value: str) -> Optional[str]:
    v = value.lower()
    if "remote" in v:
        if "hybrid" in v:
            return "hybrid"
        return "remote"
    if "on" in v and "site" in v:
        return "onsite"
    return None


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

class ScannedJob:
    """Normalised job data returned by all ATS adapters."""

    __slots__ = (
        "external_id",
        "title",
        "department",
        "location",
        "remote_type",
        "description",
        "requirements",
        "salary_min",
        "salary_max",
        "apply_url",
        "posted_at",
        "extra_meta",
    )

    def __init__(
        self,
        external_id: str,
        title: str,
        apply_url: str,
        department: Optional[str] = None,
        location: Optional[str] = None,
        remote_type: Optional[str] = None,
        description: Optional[str] = None,
        requirements: Optional[str] = None,
        salary_min: Optional[float] = None,
        salary_max: Optional[float] = None,
        posted_at: Optional[datetime] = None,
        extra_meta: Optional[dict] = None,
    ) -> None:
        self.external_id = external_id
        self.title = title
        self.apply_url = apply_url
        self.department = department
        self.location = location
        self.remote_type = remote_type
        self.description = description
        self.requirements = requirements
        self.salary_min = salary_min
        self.salary_max = salary_max
        self.posted_at = posted_at
        self.extra_meta = extra_meta or {}

    def to_dict(self) -> dict[str, Any]:
        return {slot: getattr(self, slot) for slot in self.__slots__}


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------

class ATSScanner(ABC):
    ats_name: str = "unknown"

    def __init__(self, company: dict[str, Any]) -> None:
        self.company = company
        self.career_page_url: str = company.get("career_page_url", "")
        self.ats_job_board_url: Optional[str] = company.get("ats_job_board_url")
        self.user_agent = settings.user_agent
        self.request_delay = settings.request_delay_seconds

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        """Return True if this ATS class can handle the given URL/content."""
        return False

    @abstractmethod
    async def fetch_jobs(self) -> list[ScannedJob]:
        """Fetch all open jobs and return normalised ScannedJob list."""
        ...

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        await asyncio.sleep(self.request_delay)
        headers = kwargs.pop("headers", {})
        headers.setdefault("User-Agent", self.user_agent)
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            return await client.get(url, headers=headers, **kwargs)

    async def _post(self, url: str, **kwargs) -> httpx.Response:
        await asyncio.sleep(self.request_delay)
        headers = kwargs.pop("headers", {})
        headers.setdefault("User-Agent", self.user_agent)
        async with httpx.AsyncClient(follow_redirects=True, timeout=20) as client:
            return await client.post(url, headers=headers, **kwargs)


# ---------------------------------------------------------------------------
# Greenhouse
# ---------------------------------------------------------------------------

class GreenhouseScanner(ATSScanner):
    ats_name = "greenhouse"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return (
            "boards.greenhouse.io" in url
            or "boards-api.greenhouse.io" in url
            or "greenhouse.io" in page_content
        )

    def _board_token(self) -> Optional[str]:
        """Extract board token from the ATS job board URL."""
        url = self.ats_job_board_url or self.career_page_url
        match = re.search(r"greenhouse\.io/(?:embed/job_board\?for=|boards/)([A-Za-z0-9_-]+)", url)
        return match.group(1) if match else None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def fetch_jobs(self) -> list[ScannedJob]:
        token = self._board_token()
        if not token:
            logger.warning("Greenhouse: no board token for %s", self.company.get("name"))
            return []

        api_url = f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true"
        if not _robots_allows(api_url, self.user_agent):
            logger.info("Greenhouse robots.txt disallows: %s", api_url)
            return []

        resp = await self._get(api_url)
        resp.raise_for_status()
        data = resp.json()
        jobs: list[ScannedJob] = []
        for raw in data.get("jobs", []):
            job_id = str(raw.get("id", ""))
            title = raw.get("title", "")
            abs_url = raw.get("absolute_url", "")
            location = raw.get("location", {}).get("name") if isinstance(raw.get("location"), dict) else raw.get("location")
            dept = raw.get("departments", [{}])[0].get("name") if raw.get("departments") else None
            content = raw.get("content", "")
            updated_at = raw.get("updated_at")
            posted_at = None
            if updated_at:
                try:
                    posted_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
                except ValueError:
                    pass

            jobs.append(
                ScannedJob(
                    external_id=job_id,
                    title=title,
                    apply_url=abs_url,
                    department=dept,
                    location=location,
                    description=content,
                    posted_at=posted_at,
                    extra_meta={"source": "greenhouse_api"},
                )
            )
        return jobs


# ---------------------------------------------------------------------------
# Lever
# ---------------------------------------------------------------------------

class LeverScanner(ATSScanner):
    ats_name = "lever"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "jobs.lever.co" in url or "lever.co" in page_content

    def _company_slug(self) -> Optional[str]:
        url = self.ats_job_board_url or self.career_page_url
        match = re.search(r"lever\.co/([A-Za-z0-9_-]+)", url)
        return match.group(1) if match else None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def fetch_jobs(self) -> list[ScannedJob]:
        slug = self._company_slug()
        if not slug:
            logger.warning("Lever: no company slug for %s", self.company.get("name"))
            return []

        api_url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
        if not _robots_allows(api_url, self.user_agent):
            return []

        resp = await self._get(api_url)
        resp.raise_for_status()
        data = resp.json()
        jobs: list[ScannedJob] = []
        for raw in data:
            job_id = raw.get("id", "")
            title = raw.get("text", "")
            apply_url = raw.get("applyUrl") or raw.get("hostedUrl", "")
            location = raw.get("categories", {}).get("location")
            dept = raw.get("categories", {}).get("department")
            remote_str = raw.get("categories", {}).get("commitment", "")
            remote_type = _normalize_remote(remote_str)
            created_at_ms = raw.get("createdAt")
            posted_at = datetime.utcfromtimestamp(created_at_ms / 1000) if created_at_ms else None
            lists_data = raw.get("lists", [])
            description_parts = [raw.get("descriptionPlain", "")]
            for lst in lists_data:
                description_parts.append(lst.get("content", ""))
            description = "\n".join(filter(None, description_parts))

            jobs.append(
                ScannedJob(
                    external_id=str(job_id),
                    title=title,
                    apply_url=apply_url,
                    department=dept,
                    location=location,
                    remote_type=remote_type,
                    description=description,
                    posted_at=posted_at,
                    extra_meta={"source": "lever_api"},
                )
            )
        return jobs


# ---------------------------------------------------------------------------
# Ashby
# ---------------------------------------------------------------------------

class AshbyScanner(ATSScanner):
    ats_name = "ashby"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "ashbyhq.com" in url or "jobs.ashbyhq.com" in url

    def _board_identifier(self) -> Optional[str]:
        url = self.ats_job_board_url or self.career_page_url
        match = re.search(r"ashbyhq\.com/([A-Za-z0-9_-]+)", url)
        return match.group(1) if match else None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def fetch_jobs(self) -> list[ScannedJob]:
        board_id = self._board_identifier()
        if not board_id:
            logger.warning("Ashby: no board identifier for %s", self.company.get("name"))
            return []

        api_url = f"https://api.ashbyhq.com/posting-api/job-board/{board_id}"
        if not _robots_allows(api_url, self.user_agent):
            return []

        resp = await self._post(api_url, json={"includeCompensation": True})
        resp.raise_for_status()
        data = resp.json()
        jobs: list[ScannedJob] = []
        for raw in data.get("jobPostings", []):
            job_id = str(raw.get("id", ""))
            title = raw.get("title", "")
            apply_url = raw.get("jobUrl") or raw.get("applyUrl", "")
            location = raw.get("locationName") or raw.get("location")
            dept = raw.get("departmentName")
            remote_type = "remote" if raw.get("isRemote") else None
            description = raw.get("descriptionHtml") or raw.get("description", "")
            published = raw.get("publishedDate")
            posted_at = None
            if published:
                try:
                    posted_at = datetime.fromisoformat(published.replace("Z", "+00:00"))
                except ValueError:
                    pass

            comp = raw.get("compensation", {}) or {}
            salary_min = comp.get("minValue")
            salary_max = comp.get("maxValue")

            jobs.append(
                ScannedJob(
                    external_id=job_id,
                    title=title,
                    apply_url=apply_url,
                    department=dept,
                    location=location,
                    remote_type=remote_type,
                    description=description,
                    salary_min=float(salary_min) if salary_min else None,
                    salary_max=float(salary_max) if salary_max else None,
                    posted_at=posted_at,
                    extra_meta={"source": "ashby_api"},
                )
            )
        return jobs


# ---------------------------------------------------------------------------
# Workday (Playwright scraping)
# ---------------------------------------------------------------------------

class WorkdayScanner(ATSScanner):
    ats_name = "workday"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "myworkdayjobs.com" in url or "workday.com" in page_content

    async def fetch_jobs(self) -> list[ScannedJob]:
        return await self._playwright_fetch()

    async def _playwright_fetch(self) -> list[ScannedJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("Playwright not installed")
            return []

        url = self.ats_job_board_url or self.career_page_url
        if not _robots_allows(url, self.user_agent):
            return []

        jobs: list[ScannedJob] = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=self.user_agent)
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                # Workday uses specific CSS classes for job listings
                job_cards = await page.query_selector_all(
                    "[data-automation-id='jobPostingCard'], li[class*='job'], .job-listing, [class*='jobResult']"
                )
                for card in job_cards[:100]:
                    try:
                        title_el = await card.query_selector(
                            "[data-automation-id='jobPostingTitle'], h3, h2, .job-title, a[class*='title']"
                        )
                        title = await title_el.inner_text() if title_el else ""
                        link_el = await card.query_selector("a")
                        href = await link_el.get_attribute("href") if link_el else ""
                        apply_url = urljoin(url, href) if href else url
                        location_el = await card.query_selector(
                            "[data-automation-id='jobPostingLocation'], .location, [class*='location']"
                        )
                        location = await location_el.inner_text() if location_el else None

                        if title and apply_url:
                            external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                            jobs.append(
                                ScannedJob(
                                    external_id=external_id,
                                    title=title.strip(),
                                    apply_url=apply_url,
                                    location=location,
                                    extra_meta={"source": "workday_scrape"},
                                )
                            )
                    except Exception as card_exc:
                        logger.debug("Workday card error: %s", card_exc)
            except Exception as exc:
                logger.error("WorkdayScanner error for %s: %s", self.company.get("name"), exc)
            finally:
                await browser.close()
        return jobs


# ---------------------------------------------------------------------------
# BambooHR (Playwright scraping)
# ---------------------------------------------------------------------------

class BambooHRScanner(ATSScanner):
    ats_name = "bamboohr"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "bamboohr.com" in url or "bamboohr" in page_content.lower()

    async def fetch_jobs(self) -> list[ScannedJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return []

        url = self.ats_job_board_url or self.career_page_url
        if not _robots_allows(url, self.user_agent):
            return []

        jobs: list[ScannedJob] = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=self.user_agent)
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                job_els = await page.query_selector_all(
                    "li.ResJobListing, div[class*='job'], .job-opening, li[class*='opening']"
                )
                for el in job_els[:100]:
                    try:
                        title_el = await el.query_selector("a, h2, h3, .title")
                        title = await title_el.inner_text() if title_el else ""
                        link_el = await el.query_selector("a")
                        href = await link_el.get_attribute("href") if link_el else ""
                        apply_url = urljoin(url, href) if href else url
                        location_el = await el.query_selector(".location, span[class*='location']")
                        location = await location_el.inner_text() if location_el else None

                        if title:
                            external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                            jobs.append(
                                ScannedJob(
                                    external_id=external_id,
                                    title=title.strip(),
                                    apply_url=apply_url,
                                    location=location,
                                    extra_meta={"source": "bamboohr_scrape"},
                                )
                            )
                    except Exception:
                        continue
            except Exception as exc:
                logger.error("BambooHRScanner error: %s", exc)
            finally:
                await browser.close()
        return jobs


# ---------------------------------------------------------------------------
# iCIMS (Playwright scraping)
# ---------------------------------------------------------------------------

class ICIMSScanner(ATSScanner):
    ats_name = "icims"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "icims.com" in url or "icims" in page_content.lower()

    async def fetch_jobs(self) -> list[ScannedJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return []

        url = self.ats_job_board_url or self.career_page_url
        if not _robots_allows(url, self.user_agent):
            return []

        jobs: list[ScannedJob] = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=self.user_agent)
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                job_rows = await page.query_selector_all(
                    ".iCIMS_JobsTable tr[class*='row'], div[class*='job-list'] > div, "
                    ".iCIMS_Anchor, li[class*='job']"
                )
                for row in job_rows[:100]:
                    try:
                        title_el = await row.query_selector("a, h2, h3, [class*='title']")
                        title = await title_el.inner_text() if title_el else ""
                        link_el = await row.query_selector("a")
                        href = await link_el.get_attribute("href") if link_el else ""
                        apply_url = urljoin(url, href) if href else url
                        location_el = await row.query_selector("[class*='location'], td:nth-child(2)")
                        location = await location_el.inner_text() if location_el else None

                        if title:
                            external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                            jobs.append(
                                ScannedJob(
                                    external_id=external_id,
                                    title=title.strip(),
                                    apply_url=apply_url,
                                    location=location,
                                    extra_meta={"source": "icims_scrape"},
                                )
                            )
                    except Exception:
                        continue
            except Exception as exc:
                logger.error("ICIMSScanner error: %s", exc)
            finally:
                await browser.close()
        return jobs


# ---------------------------------------------------------------------------
# SmartRecruiters (Playwright scraping + JSON fallback)
# ---------------------------------------------------------------------------

class SmartRecruitersScanner(ATSScanner):
    ats_name = "smartrecruiters"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return "smartrecruiters.com" in url or "smartrecruiters" in page_content.lower()

    def _company_slug(self) -> Optional[str]:
        url = self.ats_job_board_url or self.career_page_url
        match = re.search(r"smartrecruiters\.com/([A-Za-z0-9_-]+)", url)
        return match.group(1) if match else None

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPError),
    )
    async def fetch_jobs(self) -> list[ScannedJob]:
        slug = self._company_slug()
        if slug:
            api_url = f"https://api.smartrecruiters.com/v1/companies/{slug}/postings"
            try:
                resp = await self._get(api_url)
                resp.raise_for_status()
                data = resp.json()
                jobs: list[ScannedJob] = []
                for raw in data.get("content", []):
                    job_id = str(raw.get("id", ""))
                    title = raw.get("name", "")
                    apply_url = raw.get("ref", "")
                    location = raw.get("location", {}).get("city") if raw.get("location") else None
                    dept = raw.get("department", {}).get("label") if raw.get("department") else None
                    posted_at_str = raw.get("releasedDate")
                    posted_at = None
                    if posted_at_str:
                        try:
                            posted_at = datetime.fromisoformat(posted_at_str.replace("Z", "+00:00"))
                        except ValueError:
                            pass
                    jobs.append(
                        ScannedJob(
                            external_id=job_id,
                            title=title,
                            apply_url=apply_url,
                            department=dept,
                            location=location,
                            posted_at=posted_at,
                            extra_meta={"source": "smartrecruiters_api"},
                        )
                    )
                return jobs
            except httpx.HTTPError as exc:
                logger.warning("SmartRecruiters API failed, falling back to scrape: %s", exc)

        return await self._playwright_fallback()

    async def _playwright_fallback(self) -> list[ScannedJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return []

        url = self.ats_job_board_url or self.career_page_url
        jobs: list[ScannedJob] = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=self.user_agent)
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)
                job_els = await page.query_selector_all("li[class*='job'], .job-item, [data-job-id]")
                for el in job_els[:100]:
                    try:
                        title_el = await el.query_selector("a, h2, h3, [class*='title']")
                        title = await title_el.inner_text() if title_el else ""
                        link_el = await el.query_selector("a")
                        href = await link_el.get_attribute("href") if link_el else ""
                        apply_url = urljoin(url, href) if href else url
                        if title:
                            external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                            jobs.append(
                                ScannedJob(
                                    external_id=external_id,
                                    title=title.strip(),
                                    apply_url=apply_url,
                                    extra_meta={"source": "smartrecruiters_scrape"},
                                )
                            )
                    except Exception:
                        continue
            except Exception as exc:
                logger.error("SmartRecruitersScanner fallback error: %s", exc)
            finally:
                await browser.close()
        return jobs


# ---------------------------------------------------------------------------
# Generic / Custom (Playwright scraping)
# ---------------------------------------------------------------------------

class GenericScanner(ATSScanner):
    ats_name = "generic"

    @classmethod
    def detect(cls, url: str, page_content: str = "") -> bool:
        return True  # Fallback

    async def fetch_jobs(self) -> list[ScannedJob]:
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            return []

        url = self.career_page_url
        if not _robots_allows(url, self.user_agent):
            return []

        jobs: list[ScannedJob] = []
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=self.user_agent)
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                # Try common patterns used across job boards
                selectors_to_try = [
                    "li[class*='job']",
                    "div[class*='job-card']",
                    "div[class*='job-posting']",
                    "div[class*='position']",
                    "article[class*='job']",
                    "tr[class*='job']",
                    ".opening",
                    ".job",
                    "[data-job-id]",
                    "[data-posting-id]",
                ]
                job_els = []
                for sel in selectors_to_try:
                    job_els = await page.query_selector_all(sel)
                    if job_els:
                        break

                for el in job_els[:100]:
                    try:
                        link_el = await el.query_selector("a")
                        title_el = await el.query_selector(
                            "a, h2, h3, h4, [class*='title'], [class*='name']"
                        )
                        title = await title_el.inner_text() if title_el else ""
                        href = await link_el.get_attribute("href") if link_el else ""
                        apply_url = urljoin(url, href) if href else url
                        location_el = await el.query_selector(
                            "[class*='location'], [class*='city'], span[class*='place']"
                        )
                        location = await location_el.inner_text() if location_el else None

                        if title and title.strip():
                            external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                            jobs.append(
                                ScannedJob(
                                    external_id=external_id,
                                    title=title.strip(),
                                    apply_url=apply_url,
                                    location=location,
                                    extra_meta={"source": "generic_scrape"},
                                )
                            )
                    except Exception:
                        continue

                # If no structured listings found, try extracting all job links
                if not jobs:
                    all_links = await page.query_selector_all("a")
                    job_keywords = re.compile(
                        r"\b(engineer|developer|manager|analyst|designer|scientist|"
                        r"architect|specialist|coordinator|director|lead|senior|junior)\b",
                        re.IGNORECASE,
                    )
                    for link in all_links[:200]:
                        try:
                            text = (await link.inner_text()).strip()
                            href = await link.get_attribute("href") or ""
                            if text and job_keywords.search(text) and href:
                                apply_url = urljoin(url, href)
                                external_id = re.sub(r"[^a-zA-Z0-9]", "_", apply_url)[-128:]
                                jobs.append(
                                    ScannedJob(
                                        external_id=external_id,
                                        title=text,
                                        apply_url=apply_url,
                                        extra_meta={"source": "generic_link_scrape"},
                                    )
                                )
                        except Exception:
                            continue
            except Exception as exc:
                logger.error("GenericScanner error for %s: %s", self.company.get("name"), exc)
            finally:
                await browser.close()
        return jobs


# ---------------------------------------------------------------------------
# ATS detector registry
# ---------------------------------------------------------------------------

ATS_REGISTRY: list[type[ATSScanner]] = [
    GreenhouseScanner,
    LeverScanner,
    AshbyScanner,
    WorkdayScanner,
    BambooHRScanner,
    ICIMSScanner,
    SmartRecruitersScanner,
    GenericScanner,  # Must be last – always matches
]

ATS_CLASS_MAP: dict[str, type[ATSScanner]] = {
    "greenhouse": GreenhouseScanner,
    "lever": LeverScanner,
    "ashby": AshbyScanner,
    "workday": WorkdayScanner,
    "bamboohr": BambooHRScanner,
    "icims": ICIMSScanner,
    "smartrecruiters": SmartRecruitersScanner,
    "jobvite": GenericScanner,
    "taleo": GenericScanner,
    "rippling": GenericScanner,
    "custom": GenericScanner,
    "unknown": GenericScanner,
}


def get_scanner(company: dict[str, Any]) -> ATSScanner:
    """Return the best ATS scanner for a company record."""
    ats_type = company.get("ats_type", "unknown")
    scanner_cls = ATS_CLASS_MAP.get(ats_type, GenericScanner)
    return scanner_cls(company)


# ---------------------------------------------------------------------------
# Convenience wrapper used by scan_runner
# ---------------------------------------------------------------------------

async def scan_company(
    company_id: int,
    career_page_url: str,
    ats_type: Optional[str],
    ats_job_board_url: Optional[str],
) -> list[dict[str, Any]]:
    """Fetch jobs for a company and return them as plain dicts.

    This is the API consumed by scan_runner.run_company_scan().
    """
    company_dict = {
        "id": company_id,
        "name": "",
        "career_page_url": career_page_url,
        "ats_type": ats_type or "unknown",
        "ats_job_board_url": ats_job_board_url,
    }
    scanner = get_scanner(company_dict)
    scanned_jobs = await scanner.fetch_jobs()
    return [j.to_dict() for j in scanned_jobs]


# ---------------------------------------------------------------------------
# Eligibility detection helpers
# ---------------------------------------------------------------------------

async def detect_application_eligibility(
    apply_url: str,
    client: Any = None,  # httpx.AsyncClient – accepted but not used; kept for API compat
) -> dict[str, bool]:
    """Check if an application URL is accessible (no login, no CAPTCHA).

    Returns a dict with keys: is_public_apply, requires_login, has_captcha.
    The ``client`` parameter is accepted for backward compatibility but the
    check is performed with Playwright so the page is fully rendered.
    """
    try:
        from playwright.async_api import async_playwright
        from app.services.applicator import check_requires_login, check_has_captcha
    except ImportError:
        return {"is_public_apply": False, "requires_login": True, "has_captcha": False}

    result: dict[str, bool] = {"is_public_apply": False, "requires_login": False, "has_captcha": False}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        page = await browser.new_page(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        try:
            await page.goto(apply_url, wait_until="domcontentloaded", timeout=20000)
            result["requires_login"] = await check_requires_login(page)
            result["has_captcha"] = await check_has_captcha(page)
            result["is_public_apply"] = not result["requires_login"] and not result["has_captcha"]
        except Exception as exc:
            logger.debug("detect_application_eligibility error for %s: %s", apply_url, exc)
            result["requires_login"] = True
        finally:
            await browser.close()

    return result
