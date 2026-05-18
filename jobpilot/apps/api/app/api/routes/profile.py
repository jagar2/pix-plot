"""Candidate profile management routes including resume upload."""

from __future__ import annotations

import io
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CandidateProfile
from app.schemas import (
    CandidateProfileCreate,
    CandidateProfileRead,
    CandidateProfileUpdate,
    ResumeUploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["profile"])

ALLOWED_RESUME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
MAX_RESUME_SIZE = 5 * 1024 * 1024  # 5 MB


def _extract_text_from_pdf(data: bytes) -> str:
    try:
        import PyPDF2

        reader = PyPDF2.PdfReader(io.BytesIO(data))
        parts = []
        for page in reader.pages:
            parts.append(page.extract_text() or "")
        return "\n".join(parts)
    except Exception as exc:
        logger.error("PDF extraction failed: %s", exc)
        return ""


def _extract_text_from_docx(data: bytes) -> str:
    try:
        import docx

        doc = docx.Document(io.BytesIO(data))
        return "\n".join(para.text for para in doc.paragraphs)
    except Exception as exc:
        logger.error("DOCX extraction failed: %s", exc)
        return ""


@router.get("", response_model=CandidateProfileRead)
async def get_profile(db: AsyncSession = Depends(get_db)) -> CandidateProfile:
    profile = (await db.execute(select(CandidateProfile).limit(1))).scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="No candidate profile found. Create one first.")
    return profile


@router.post("", response_model=CandidateProfileRead, status_code=status.HTTP_201_CREATED)
async def create_profile(
    body: CandidateProfileCreate,
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    existing = (await db.execute(select(CandidateProfile).limit(1))).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A candidate profile already exists. Use PATCH to update it.",
        )
    profile = CandidateProfile(**body.model_dump())
    db.add(profile)
    await db.commit()
    await db.refresh(profile)
    return profile


@router.put("", response_model=CandidateProfileRead)
@router.patch("", response_model=CandidateProfileRead)
async def update_profile(
    body: CandidateProfileUpdate,
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    profile = (await db.execute(select(CandidateProfile).limit(1))).scalar_one_or_none()
    if not profile:
        data = body.model_dump(exclude_none=True)
        if "full_name" not in data or "email" not in data:
            raise HTTPException(status_code=422, detail="full_name and email required to create profile.")
        profile = CandidateProfile(**data)
        db.add(profile)
    else:
        for field, value in body.model_dump(exclude_none=True).items():
            setattr(profile, field, value)
        profile.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/resume", response_model=ResumeUploadResponse)
async def upload_resume(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
) -> ResumeUploadResponse:
    """Upload a resume (PDF, DOCX, or TXT), extract text, and parse with AI."""
    if file.content_type not in ALLOWED_RESUME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{file.content_type}'. Upload PDF, DOCX, or TXT.",
        )

    data = await file.read()
    if len(data) > MAX_RESUME_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Resume file too large. Maximum size is 5 MB.",
        )

    # Extract raw text
    if file.content_type == "application/pdf":
        resume_text = _extract_text_from_pdf(data)
    elif file.content_type in (
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        resume_text = _extract_text_from_docx(data)
    else:
        resume_text = data.decode("utf-8", errors="replace")

    # Parse with AI
    from app.services.ai_service import parse_resume

    parsed = parse_resume(resume_text)

    # Update candidate profile if one exists
    profile = (await db.execute(select(CandidateProfile).limit(1))).scalar_one_or_none()
    if profile:
        profile.resume_text = resume_text
        profile.resume_filename = file.filename
        if parsed.get("skills"):
            profile.skills = parsed["skills"]
        if parsed.get("experience_years") is not None:
            profile.experience_years = parsed["experience_years"]
        if parsed.get("education"):
            profile.education = parsed["education"]
        if parsed.get("work_history"):
            profile.work_history = parsed["work_history"]
        profile.updated_at = datetime.utcnow()
        await db.commit()

    return ResumeUploadResponse(
        filename=file.filename or "resume",
        size_bytes=len(data),
        parsed_skills=parsed.get("skills", []),
        parsed_experience_years=parsed.get("experience_years"),
        parsed_education=parsed.get("education", []),
        parsed_work_history=parsed.get("work_history", []),
        message="Resume uploaded and parsed successfully",
    )
