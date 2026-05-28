import anthropic
from pathlib import Path
from models import JobListing, UserProfile


RESUME_SYSTEM_PROMPT = """You are an expert resume writer and career coach. Your job is to tailor a resume to a specific job description while keeping all information truthful and accurate.

Rules:
- Never fabricate experience, skills, or accomplishments
- Reorder and emphasize existing content to match job requirements
- Mirror keywords and terminology from the job description naturally
- Keep formatting clean and ATS-friendly (no tables, columns, or special characters)
- Output only the tailored resume text, nothing else"""

COVER_LETTER_SYSTEM_PROMPT = """You are an expert cover letter writer. Write compelling, concise cover letters that:
- Open with a strong hook connecting the candidate to the role
- Highlight 2-3 specific accomplishments relevant to the job
- Show genuine interest in the company and role
- Stay under 350 words
- End with a clear call to action
- Output only the cover letter text, nothing else"""


class ContentTailor:
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    def tailor_resume(self, base_resume: str, job: JobListing) -> str:
        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2000,
            system=RESUME_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": base_resume,
                            "cache_control": {"type": "ephemeral"},
                        },
                        {
                            "type": "text",
                            "text": f"Job Title: {job.title}\nCompany: {job.company}\n\nJob Description:\n{job.description}\n\nTailor the resume above for this role.",
                        },
                    ],
                }
            ],
        )
        return response.content[0].text

    def write_cover_letter(
        self, cover_letter_template: str, job: JobListing, profile: UserProfile
    ) -> str:
        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=800,
            system=COVER_LETTER_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": cover_letter_template,
                            "cache_control": {"type": "ephemeral"},
                        },
                        {
                            "type": "text",
                            "text": (
                                f"Candidate: {profile.full_name}\n"
                                f"Job Title: {job.title}\n"
                                f"Company: {job.company}\n"
                                f"Location: {job.location}\n\n"
                                f"Job Description:\n{job.description}\n\n"
                                "Write a tailored cover letter for this candidate and role using the template above as a reference for tone, style, and background."
                            ),
                        },
                    ],
                }
            ],
        )
        return response.content[0].text

    def screen_job_fit(self, base_resume: str, job: JobListing, threshold: int = 60) -> tuple[bool, int]:
        """Returns (is_good_fit, fit_score_0_to_100)."""
        response = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=100,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Rate how well this resume matches the job on a scale of 0-100. "
                        f"Reply with only a number.\n\n"
                        f"RESUME:\n{base_resume[:3000]}\n\n"
                        f"JOB: {job.title} at {job.company}\n{job.description[:2000]}"
                    ),
                }
            ],
        )
        try:
            score = int(response.content[0].text.strip())
        except ValueError:
            score = 50
        return score >= threshold, score
