"""
Entry point for the Job Application Agent.

Usage:
    python main.py --keywords "software engineer" --location "New York, NY"
    python main.py --keywords "data scientist" --location "Remote" --dry-run
"""

import argparse
import os
import sys

from config import AgentConfig, AccountConfig, SearchConfig
from models import UserProfile
from agent import JobApplicationAgent


def parse_args():
    p = argparse.ArgumentParser(description="Indeed Job Application Agent")
    p.add_argument("--keywords", required=True, help="Comma-separated job keywords")
    p.add_argument("--location", required=True, help="Job location (city, state or 'Remote')")
    p.add_argument("--max", type=int, default=5, help="Max applications to submit (default: 5)")
    p.add_argument("--radius", type=int, default=25, help="Search radius in miles")
    p.add_argument("--job-type", choices=["fulltime", "parttime", "contract", "internship"])
    p.add_argument("--easy-apply-only", action="store_true", help="Only apply to Easy Apply jobs")
    p.add_argument("--dry-run", action="store_true", help="Fill forms but do not submit")
    p.add_argument("--headless", action="store_true", help="Run browser in headless mode")
    p.add_argument("--resume", default="templates/resume.txt", help="Path to base resume")
    p.add_argument("--cover-letter", default="templates/cover_letter_template.txt")
    p.add_argument("--output", default="output", help="Output directory for tailored docs")
    return p.parse_args()


def build_profile_from_env() -> UserProfile:
    return UserProfile(
        full_name=os.environ.get("APPLICANT_NAME", ""),
        email=os.environ.get("INDEED_EMAIL", ""),
        phone=os.environ.get("APPLICANT_PHONE", ""),
        location=os.environ.get("APPLICANT_LOCATION", ""),
        linkedin_url=os.environ.get("APPLICANT_LINKEDIN", ""),
        portfolio_url=os.environ.get("APPLICANT_PORTFOLIO", ""),
        years_of_experience=int(os.environ.get("APPLICANT_YOE", "0")),
    )


def main():
    args = parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY environment variable is required.")
        sys.exit(1)

    email = os.environ.get("INDEED_EMAIL", "")
    password = os.environ.get("INDEED_PASSWORD", "")
    if not email or not password:
        print("ERROR: INDEED_EMAIL and INDEED_PASSWORD environment variables are required.")
        sys.exit(1)

    config = AgentConfig(
        account=AccountConfig(
            email=email,
            password=password,
            create_if_missing=True,
        ),
        search=SearchConfig(
            keywords=args.keywords.split(","),
            location=args.location,
            radius_miles=args.radius,
            job_type=args.job_type,
            max_applications=args.max,
            easy_apply_only=args.easy_apply_only,
        ),
        resume_path=args.resume,
        cover_letter_template_path=args.cover_letter,
        output_dir=args.output,
        anthropic_api_key=api_key,
        headless=args.headless,
        dry_run=args.dry_run,
    )

    profile = build_profile_from_env()
    if not profile.full_name:
        print("ERROR: APPLICANT_NAME environment variable is required.")
        sys.exit(1)

    agent = JobApplicationAgent(config=config, profile=profile)
    agent.run()


if __name__ == "__main__":
    main()
