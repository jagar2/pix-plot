import time
import random
from pathlib import Path
from typing import Optional
from playwright.sync_api import sync_playwright, Page, Browser, BrowserContext

from models import JobListing, UserProfile, Application, ApplicationStatus
from config import AccountConfig, SearchConfig


INDEED_BASE = "https://www.indeed.com"


def _human_delay(min_ms: int = 300, max_ms: int = 900):
    time.sleep(random.uniform(min_ms / 1000, max_ms / 1000))


def _safe_fill(page: Page, selector: str, value: str):
    page.wait_for_selector(selector, timeout=10000)
    page.fill(selector, "")
    page.type(selector, value, delay=random.randint(40, 120))
    _human_delay()


class IndeedSession:
    def __init__(self, headless: bool = False):
        self._playwright = sync_playwright().start()
        self.browser: Browser = self._playwright.chromium.launch(
            headless=headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        self.context: BrowserContext = self.browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
        )
        self.page: Page = self.context.new_page()
        self._logged_in = False

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------

    def create_account(self, email: str, password: str) -> bool:
        """Navigate to Indeed account creation and fill in credentials."""
        self.page.goto(f"{INDEED_BASE}/account/Login", wait_until="networkidle")
        _human_delay(500, 1200)

        create_link = self.page.locator("a:has-text('Create an account'), a:has-text('Sign up')")
        if create_link.count() == 0:
            print("[browser] Could not find 'Create account' link — account may already exist.")
            return False

        create_link.first.click()
        _human_delay(800, 1500)

        _safe_fill(self.page, "input[name='email'], input[type='email']", email)
        _safe_fill(self.page, "input[name='password'], input[type='password']", password)

        self.page.locator("button[type='submit']").first.click()
        _human_delay(2000, 3500)

        print("[browser] Account creation submitted. Email verification may be required.")
        return True

    def login(self, email: str, password: str) -> bool:
        self.page.goto(f"{INDEED_BASE}/account/Login", wait_until="networkidle")
        _human_delay(500, 1200)

        try:
            _safe_fill(self.page, "input[name='email'], input[type='email']", email)
            self.page.locator("button[type='submit']").first.click()
            _human_delay(1000, 2000)
            _safe_fill(self.page, "input[name='password'], input[type='password']", password)
            self.page.locator("button[type='submit']").first.click()
            _human_delay(2000, 4000)
        except Exception as e:
            print(f"[browser] Login error: {e}")
            return False

        self._logged_in = "dashboard" in self.page.url or "resumes" in self.page.url
        print(f"[browser] Login {'succeeded' if self._logged_in else 'may have failed — check page'}")
        return self._logged_in

    def ensure_logged_in(self, config: AccountConfig) -> bool:
        if self._logged_in:
            return True
        if config.create_if_missing:
            self.create_account(config.email, config.password)
        return self.login(config.email, config.password)

    # ------------------------------------------------------------------
    # Job Search
    # ------------------------------------------------------------------

    def search_jobs(self, config: SearchConfig) -> list[JobListing]:
        keywords = " ".join(config.keywords)
        url = (
            f"{INDEED_BASE}/jobs?q={keywords.replace(' ', '+')}"
            f"&l={config.location.replace(' ', '+')}"
        )
        if config.job_type:
            url += f"&jt={config.job_type}"
        if config.radius_miles:
            url += f"&radius={config.radius_miles}"
        if config.easy_apply_only:
            url += "&sc=0kf%3Aattr(DSQF7)%3B"  # Indeed's Easy Apply filter

        self.page.goto(url, wait_until="networkidle")
        _human_delay(1000, 2000)

        jobs: list[JobListing] = []
        cards = self.page.locator("div.job_seen_beacon, div[class*='jobCard'], li[class*='job']").all()

        for card in cards[:config.max_applications * 2]:
            try:
                title_el = card.locator("h2 a span, a[data-jk] span").first
                title = title_el.inner_text() if title_el.count() else ""

                company_el = card.locator("[data-testid='company-name'], span.companyName").first
                company = company_el.inner_text() if company_el.count() else ""

                location_el = card.locator("[data-testid='text-location'], div.companyLocation").first
                location = location_el.inner_text() if location_el.count() else ""

                link_el = card.locator("h2 a, a[data-jk]").first
                href = link_el.get_attribute("href") if link_el.count() else ""
                job_url = f"{INDEED_BASE}{href}" if href and href.startswith("/") else href or ""
                job_id = job_url.split("jk=")[-1].split("&")[0] if "jk=" in job_url else job_url

                easy_apply = card.locator("span:has-text('Easily apply'), button:has-text('Apply now')").count() > 0

                if title and company:
                    jobs.append(JobListing(
                        title=title.strip(),
                        company=company.strip(),
                        location=location.strip(),
                        description="",  # fetched separately
                        url=job_url,
                        job_id=job_id,
                        easy_apply=easy_apply,
                    ))
            except Exception as e:
                print(f"[browser] Error parsing job card: {e}")

        return jobs

    def fetch_job_description(self, job: JobListing) -> str:
        self.page.goto(job.url, wait_until="networkidle")
        _human_delay(800, 1500)

        desc_el = self.page.locator(
            "#jobDescriptionText, div[class*='jobsearch-jobDescriptionText']"
        ).first
        return desc_el.inner_text() if desc_el.count() else ""

    # ------------------------------------------------------------------
    # Easy Apply
    # ------------------------------------------------------------------

    def apply_easy_apply(
        self,
        application: Application,
        profile: UserProfile,
        resume_path: str,
        dry_run: bool = False,
    ) -> ApplicationStatus:
        self.page.goto(application.job.url, wait_until="networkidle")
        _human_delay(1000, 2000)

        apply_btn = self.page.locator(
            "button:has-text('Apply now'), button:has-text('Easy Apply'), a:has-text('Apply now')"
        ).first
        if apply_btn.count() == 0:
            print(f"[browser] No apply button found for {application.job.title}")
            return ApplicationStatus.SKIPPED

        apply_btn.click()
        _human_delay(1500, 2500)

        # Multi-step application loop
        for step in range(10):
            self._fill_application_step(page=self.page, profile=profile)

            # Upload resume if file input present
            file_inputs = self.page.locator("input[type='file']")
            if file_inputs.count() > 0 and Path(resume_path).exists():
                file_inputs.first.set_input_files(resume_path)
                _human_delay(500, 1000)

            # Cover letter textarea
            if application.cover_letter:
                cl_area = self.page.locator(
                    "textarea[name*='cover'], textarea[id*='cover'], textarea[placeholder*='cover']"
                ).first
                if cl_area.count() > 0:
                    cl_area.fill(application.cover_letter)
                    _human_delay(300, 600)

            next_btn = self.page.locator(
                "button:has-text('Continue'), button:has-text('Next'), button[type='submit']"
            ).last

            is_final_submit = "submit" in (next_btn.get_attribute("data-testid") or "").lower()

            if is_final_submit or step == 9:
                if dry_run:
                    print(f"[browser] DRY RUN — would submit application for {application.job.title}")
                    return ApplicationStatus.APPLIED
                next_btn.click()
                _human_delay(2000, 3500)
                print(f"[browser] Application submitted for {application.job.title}")
                return ApplicationStatus.APPLIED

            next_btn.click()
            _human_delay(1000, 2000)

            # Detect confirmation page
            if self.page.locator("h1:has-text('Application submitted'), h2:has-text('applied')").count() > 0:
                return ApplicationStatus.APPLIED

        return ApplicationStatus.FAILED

    def _fill_application_step(self, page: Page, profile: UserProfile):
        """Fill common form fields found on the current step."""
        field_map = {
            "input[name*='name'][name*='first'], input[id*='firstName']": profile.full_name.split()[0],
            "input[name*='name'][name*='last'], input[id*='lastName']": profile.full_name.split()[-1],
            "input[name*='phone'], input[type='tel']": profile.phone,
            "input[name*='city'], input[placeholder*='city']": profile.location,
        }
        for selector, value in field_map.items():
            try:
                el = page.locator(selector).first
                if el.count() > 0 and el.input_value() == "":
                    _safe_fill(page, selector, value)
            except Exception:
                pass

    def close(self):
        self.context.close()
        self.browser.close()
        self._playwright.stop()
