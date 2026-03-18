"""
routers/jobs.py
────────────────
Endpoints for Job Description upload and management.

  POST /jobs/           – upload JD text (AI auto-parses skills)
  POST /jobs/upload-file– upload PDF/DOCX JD file
  GET  /jobs/           – list all JDs for current user
  GET  /jobs/{id}       – get single JD
  DELETE /jobs/{id}     – delete a JD
"""

import io
import PyPDF2
import docx

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import JobDescription, User
from schemas import JDCreate, JDOut
from routers.auth import get_current_user
from services.ai_service import parse_jd

router = APIRouter(prefix="/jobs", tags=["Job Descriptions"])


# ─────────────────────────────────────────────────────────────
# HELPER: extract text from uploaded file bytes
# ─────────────────────────────────────────────────────────────
def _extract_text_from_upload(file_bytes: bytes, content_type: str) -> str:
    """
    Parse text from PDF or DOCX uploaded file bytes.
    Returns raw text string.
    """
    if "pdf" in content_type:
        reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)

    elif "wordprocessingml" in content_type or "docx" in content_type:
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join(para.text for para in doc.paragraphs)

    elif "text" in content_type:
        return file_bytes.decode("utf-8", errors="replace")

    raise HTTPException(status_code=415, detail="Unsupported file type. Use PDF, DOCX, or TXT.")


# ─────────────────────────────────────────────────────────────
# POST: upload JD as plain text
# ─────────────────────────────────────────────────────────────
@router.post("/", response_model=JDOut, status_code=201)
def create_jd(
    payload: JDCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts raw JD text.
    Claude AI automatically extracts required_skills and experience range.
    """
    # Let Claude parse the JD for structured data
    parsed = parse_jd(payload.jd_text)

    jd = JobDescription(
        title           = payload.title,
        company         = payload.company,
        jd_text         = payload.jd_text,
        required_skills = parsed.get("required_skills", []),
        experience_min  = parsed.get("experience_min", 0),
        experience_max  = parsed.get("experience_max", 99),
        uploaded_by     = current_user.id,
    )
    db.add(jd)
    db.commit()
    db.refresh(jd)
    return jd


# ─────────────────────────────────────────────────────────────
# POST: upload JD as a file (PDF / DOCX / TXT)
# ─────────────────────────────────────────────────────────────
@router.post("/upload-file", response_model=JDOut, status_code=201)
async def upload_jd_file(
    title:   str        = Form(...),
    company: str        = Form(""),
    file:    UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a PDF/DOCX job description file.
    Text is extracted and then passed through AI parsing.
    """
    file_bytes   = await file.read()
    jd_text      = _extract_text_from_upload(file_bytes, file.content_type or "")

    if not jd_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from file")

    # Parse with Claude
    parsed = parse_jd(jd_text)

    jd = JobDescription(
        title           = title,
        company         = company or None,
        jd_text         = jd_text,
        required_skills = parsed.get("required_skills", []),
        experience_min  = parsed.get("experience_min", 0),
        experience_max  = parsed.get("experience_max", 99),
        uploaded_by     = current_user.id,
    )
    db.add(jd)
    db.commit()
    db.refresh(jd)
    return jd


# ─────────────────────────────────────────────────────────────
# LIST JDs FOR CURRENT USER
# ─────────────────────────────────────────────────────────────
@router.get("/", response_model=List[JDOut])
def list_jds(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all job descriptions uploaded by the logged-in user."""
    return (
        db.query(JobDescription)
        .filter(JobDescription.uploaded_by == current_user.id)
        .order_by(JobDescription.created_at.desc())
        .all()
    )


# ─────────────────────────────────────────────────────────────
# GET SINGLE JD
# ─────────────────────────────────────────────────────────────
@router.get("/{jd_id}", response_model=JDOut)
def get_jd(
    jd_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Fetch a single JD by ID."""
    jd = db.query(JobDescription).filter(JobDescription.id == jd_id).first()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")
    return jd


# ─────────────────────────────────────────────────────────────
# DELETE JD
# ─────────────────────────────────────────────────────────────
@router.delete("/{jd_id}", status_code=204)
def delete_jd(
    jd_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a JD (only the owner can delete)."""
    jd = db.query(JobDescription).filter(
        JobDescription.id == jd_id,
        JobDescription.uploaded_by == current_user.id,
    ).first()

    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found or not yours")

    db.delete(jd)
    db.commit()
