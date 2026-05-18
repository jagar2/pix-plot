"""AI service powered by Anthropic Claude for resume parsing, job matching,
cover letter generation, and application question answering."""

from __future__ import annotations

import json
import logging
from typing import Any

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-6"


def _get_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


# ---------------------------------------------------------------------------
# Resume parsing
# ---------------------------------------------------------------------------

PARSE_RESUME_SYSTEM = """\
You are an expert resume parser. Extract structured information from the provided resume text.
Return ONLY valid JSON with no markdown fences or extra commentary.

JSON shape:
{
  "skills": ["skill1", "skill2", ...],
  "experience_years": <integer or null>,
  "education": [
    {"degree": "...", "field": "...", "institution": "...", "year": <int or null>}
  ],
  "work_history": [
    {
      "title": "...",
      "company": "...",
      "start_date": "...",
      "end_date": "...",
      "description": "..."
    }
  ],
  "summary": "...",
  "certifications": ["..."],
  "languages": ["..."]
}
"""


def parse_resume(text: str) -> dict[str, Any]:
    """Extract structured data from raw resume text using Claude."""
    client = _get_client()
    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=2048,
            system=PARSE_RESUME_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": f"Parse this resume:\n\n{text[:12000]}",
                }
            ],
        )
        raw = message.content[0].text.strip()
        # Strip accidental markdown fences
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, anthropic.APIError) as exc:
        logger.error("parse_resume failed: %s", exc)
        return {
            "skills": [],
            "experience_years": None,
            "education": [],
            "work_history": [],
            "summary": "",
            "certifications": [],
            "languages": [],
        }


# ---------------------------------------------------------------------------
# Job matching
# ---------------------------------------------------------------------------

MATCH_JOB_SYSTEM = """\
You are a job-fit analyst. Given a job posting and a candidate profile, compute a match score
and provide a detailed analysis.

Return ONLY valid JSON (no markdown fences):
{
  "score": <float 0.0-1.0>,
  "explanation": "...",
  "strengths": ["...", "..."],
  "gaps": ["...", "..."],
  "recommended_highlights": ["...", "..."]
}

Scoring rubric:
- 0.90-1.00: Exceptional fit – candidate exceeds nearly all requirements
- 0.75-0.89: Strong fit – minor gaps, worth applying
- 0.60-0.74: Moderate fit – some gaps but transferable skills exist
- 0.40-0.59: Weak fit – significant gaps
- 0.00-0.39: Poor fit – major misalignment
"""


def match_job(job: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    """Score how well a candidate profile matches a job posting."""
    client = _get_client()

    job_text = (
        f"Title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Location: {job.get('location', '')}\n"
        f"Description:\n{str(job.get('description', ''))[:4000]}\n"
        f"Requirements:\n{str(job.get('requirements', ''))[:2000]}"
    )

    profile_text = json.dumps(
        {
            "full_name": profile.get("full_name"),
            "skills": profile.get("skills"),
            "experience_years": profile.get("experience_years"),
            "target_roles": profile.get("target_roles"),
            "education": profile.get("education"),
            "work_history": profile.get("work_history"),
            "open_to_remote": profile.get("open_to_remote"),
            "location_city": profile.get("location_city"),
            "location_state": profile.get("location_state"),
            "min_salary": profile.get("min_salary"),
        },
        indent=2,
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=MATCH_JOB_SYSTEM,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"JOB POSTING:\n{job_text}\n\n"
                        f"CANDIDATE PROFILE:\n{profile_text}\n\n"
                        "Analyze the fit."
                    ),
                }
            ],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, anthropic.APIError) as exc:
        logger.error("match_job failed: %s", exc)
        return {
            "score": 0.0,
            "explanation": f"Matching failed: {exc}",
            "strengths": [],
            "gaps": [],
            "recommended_highlights": [],
        }


# ---------------------------------------------------------------------------
# Cover letter generation
# ---------------------------------------------------------------------------

COVER_LETTER_SYSTEM = """\
You are an expert career coach who writes compelling, personalised cover letters.
Write a cover letter that:
- Is 3-4 paragraphs, professional yet warm in tone
- Opens with a strong hook referencing the specific role and company
- Highlights 2-3 concrete accomplishments that map to the job's key requirements
- Closes with a clear call-to-action
- Does NOT use generic phrases like "I am writing to express my interest"
- Is addressed "Dear Hiring Manager," unless a specific name is supplied
Return ONLY the cover letter text, no extra commentary.
"""


def generate_cover_letter(
    job: dict[str, Any],
    profile: dict[str, Any],
    match: dict[str, Any],
) -> str:
    """Generate a tailored cover letter for a specific job."""
    client = _get_client()

    strengths = "\n".join(f"- {s}" for s in match.get("strengths", []))
    highlights = "\n".join(
        f"- {h}" for h in match.get("recommended_highlights", [])
    )

    user_msg = (
        f"Job title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n"
        f"Job description (excerpt):\n{str(job.get('description', ''))[:3000]}\n\n"
        f"Candidate name: {profile.get('full_name', '')}\n"
        f"Skills: {', '.join(profile.get('skills') or [])}\n"
        f"Experience: {profile.get('experience_years')} years\n"
        f"Work history summary:\n"
        + "\n".join(
            f"- {w.get('title', '')} at {w.get('company', '')} ({w.get('start_date', '')} – {w.get('end_date', '')})"
            for w in (profile.get("work_history") or [])[:4]
        )
        + f"\n\nKey strengths for this role:\n{strengths}\n"
        f"Recommended highlights:\n{highlights}\n\n"
        "Write the cover letter."
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=COVER_LETTER_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        return message.content[0].text.strip()
    except (IndexError, anthropic.APIError) as exc:
        logger.error("generate_cover_letter failed: %s", exc)
        return ""


# ---------------------------------------------------------------------------
# Application question answering
# ---------------------------------------------------------------------------

ANSWER_QUESTIONS_SYSTEM = """\
You are helping a job applicant answer application form questions honestly and concisely.
Use the provided candidate profile and job context to craft authentic answers.
Return ONLY valid JSON mapping each question (as provided) to its answer string.
Keep answers concise: 1-3 sentences for yes/no or short-answer questions,
2-4 sentences for open-ended questions.

Example output:
{"Are you authorized to work in the US?": "Yes, I am authorized to work in the United States.",
 "Why do you want to work here?": "..."}
"""


def generate_answers(
    questions: list[str],
    job: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, str]:
    """Answer a list of application form questions using the candidate profile."""
    if not questions:
        return {}

    client = _get_client()

    profile_summary = json.dumps(
        {
            "full_name": profile.get("full_name"),
            "skills": profile.get("skills"),
            "experience_years": profile.get("experience_years"),
            "location_city": profile.get("location_city"),
            "location_state": profile.get("location_state"),
            "open_to_remote": profile.get("open_to_remote"),
            "willing_to_relocate": profile.get("willing_to_relocate"),
            "min_salary": profile.get("min_salary"),
            "linkedin_url": profile.get("linkedin_url"),
            "github_url": profile.get("github_url"),
        },
        indent=2,
    )

    questions_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))

    user_msg = (
        f"Job title: {job.get('title', '')}\n"
        f"Company: {job.get('company_name', '')}\n\n"
        f"Candidate profile:\n{profile_summary}\n\n"
        f"Application questions:\n{questions_text}\n\n"
        "Answer all questions."
    )

    try:
        message = client.messages.create(
            model=MODEL,
            max_tokens=1500,
            system=ANSWER_QUESTIONS_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw = message.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw)
    except (json.JSONDecodeError, IndexError, anthropic.APIError) as exc:
        logger.error("generate_answers failed: %s", exc)
        return {q: "" for q in questions}
