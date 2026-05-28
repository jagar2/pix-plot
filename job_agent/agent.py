import json
import shutil
from datetime import datetime
from pathlib import Path

from config import AgentConfig
from models import Application, ApplicationStatus, JobListing, UserProfile
from browser import IndeedSession
from tailoring import ContentTailor


class JobApplicationAgent:
    def __init__(self, config: AgentConfig, profile: UserProfile):
        self.config = config
        self.profile = profile
        self.tailor = ContentTailor(api_key=config.anthropic_api_key)
        self.output_dir = Path(config.output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.log: list[dict] = []

        self.base_resume = Path(config.resume_path).read_text()
        self.cover_letter_template = Path(config.cover_letter_template_path).read_text()

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def run(self):
        print(f"\n{'='*60}")
        print(f"Job Application Agent — {datetime.now().strftime('%Y-%m-%d %H:%M')}")
        print(f"{'='*60}\n")

        session = IndeedSession(headless=self.config.headless)
        try:
            session.ensure_logged_in(self.config.account)
            jobs = session.search_jobs(self.config.search)
            print(f"[agent] Found {len(jobs)} job listings. Screening fit...\n")

            applied = 0
            for job in jobs:
                if applied >= self.config.search.max_applications:
                    print(f"[agent] Reached max applications ({self.config.search.max_applications}).")
                    break

                job.description = session.fetch_job_description(job)
                application = self._process_job(job, session)
                self._log_application(application)

                if application.status == ApplicationStatus.APPLIED:
                    applied += 1

        finally:
            session.close()
            self._save_log()
            print(f"\n[agent] Done. Log saved to {self.output_dir / 'log.json'}")

    # ------------------------------------------------------------------
    # Per-job processing
    # ------------------------------------------------------------------

    def _process_job(self, job: JobListing, session: IndeedSession) -> Application:
        print(f"[agent] Processing: {job.title} @ {job.company}")

        app = Application(job=job)

        # Screen fit
        is_fit, score = self.tailor.screen_job_fit(self.base_resume, job)
        print(f"         Fit score: {score}/100 — {'PASS' if is_fit else 'SKIP'}")
        if not is_fit:
            app.status = ApplicationStatus.SKIPPED
            app.notes = f"Fit score too low: {score}/100"
            return app

        # Tailor resume
        print("         Tailoring resume...")
        tailored_resume = self.tailor.tailor_resume(self.base_resume, job)
        resume_path = self._save_resume(tailored_resume, job)
        app.tailored_resume_path = str(resume_path)

        # Generate cover letter
        print("         Writing cover letter...")
        app.cover_letter = self.tailor.write_cover_letter(
            self.cover_letter_template, job, self.profile
        )
        self._save_cover_letter(app.cover_letter, job)

        # Apply
        if job.easy_apply:
            print("         Submitting Easy Apply...")
            app.status = session.apply_easy_apply(
                application=app,
                profile=self.profile,
                resume_path=str(resume_path),
                dry_run=self.config.dry_run,
            )
        else:
            print(f"         External application required: {job.url}")
            app.status = ApplicationStatus.SKIPPED
            app.notes = "External application — resume and cover letter saved to output/"

        app.applied_at = datetime.now() if app.status == ApplicationStatus.APPLIED else None
        print(f"         Status: {app.status.value}\n")
        return app

    # ------------------------------------------------------------------
    # File helpers
    # ------------------------------------------------------------------

    def _save_resume(self, content: str, job: JobListing) -> Path:
        safe_company = "".join(c if c.isalnum() else "_" for c in job.company)
        safe_title = "".join(c if c.isalnum() else "_" for c in job.title)
        path = self.output_dir / f"resume_{safe_company}_{safe_title}.txt"
        path.write_text(content)
        return path

    def _save_cover_letter(self, content: str, job: JobListing) -> Path:
        safe_company = "".join(c if c.isalnum() else "_" for c in job.company)
        safe_title = "".join(c if c.isalnum() else "_" for c in job.title)
        path = self.output_dir / f"coverletter_{safe_company}_{safe_title}.txt"
        path.write_text(content)
        return path

    def _log_application(self, app: Application):
        self.log.append({
            "title": app.job.title,
            "company": app.job.company,
            "location": app.job.location,
            "url": app.job.url,
            "status": app.status.value,
            "applied_at": app.applied_at.isoformat() if app.applied_at else None,
            "resume": app.tailored_resume_path,
            "notes": app.notes,
        })

    def _save_log(self):
        log_path = self.output_dir / "log.json"
        log_path.write_text(json.dumps(self.log, indent=2))
