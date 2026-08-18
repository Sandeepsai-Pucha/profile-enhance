"""
routers/jobs.py
────────────────
Job Description management endpoints.

  POST /jobs/            – create JD from plain text (AI parses + structures)
  POST /jobs/upload-file – upload PDF / DOCX / TXT (text extracted, then AI parsed)
  GET  /jobs/            – list all JDs for the current user
  GET  /jobs/{id}        – get a single JD with full parsed data
  DELETE /jobs/{id}      – delete a JD (owner only)
"""

import io
import PyPDF2
import docx

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import JobDescription, User
from schemas import JDCreate, JDOut, JDWeightsUpdate
from routers.auth import get_current_user
from services.duplicate_service import find_similar_jds
import os as _os
if _os.getenv("AI_PROVIDER", "gemini").lower() == "ollama":
    from services.ollama_service import parse_jd
else:
    from services.ai_service import parse_jd

router = APIRouter(prefix="/jobs", tags=["Job Descriptions"])

# Max file size: 10 MB
MAX_FILE_BYTES = 10 * 1024 * 1024

# Default scoring weights — must match services/matching_service.py's defaults.
DEFAULT_WEIGHTS = {
    "weight_skills":       55.0,
    "weight_experience":   25.0,
    "weight_nice_to_have": 15.0,
    "weight_education":     5.0,
}
WEIGHTS_SUM_TOLERANCE = 0.5  # allow tiny float rounding slack around 100


# ─────────────────────────────────────────────────────────────
# HELPER: extract text from uploaded file bytes
# ─────────────────────────────────────────────────────────────
def _extract_text(file_bytes: bytes, content_type: str, filename: str = "") -> str:
    ct = (content_type or "").lower()
    fn = (filename or "").lower()

    try:
        if "pdf" in ct or fn.endswith(".pdf"):
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text   = "\n".join(page.extract_text() or "" for page in reader.pages)
            if not text.strip():
                raise HTTPException(
                    status_code=422,
                    detail="PDF appears to be scanned / image-based. "
                           "Please use a text-based PDF or paste the JD text instead.",
                )
            return text

        if "wordprocessingml" in ct or fn.endswith(".docx"):
            doc  = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs)

        if "text" in ct or fn.endswith(".txt"):
            return file_bytes.decode("utf-8", errors="replace")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    raise HTTPException(
        status_code=415,
        detail="Unsupported file type. Please upload a PDF, DOCX, or TXT file.",
    )


# ─────────────────────────────────────────────────────────────
# HELPER: run AI parse + build JobDescription ORM object
# ─────────────────────────────────────────────────────────────
def _build_jd_from_text(
    title:   str,
    company: str,
    jd_text: str,
    user_id: int,
    db:      Session,
    force:   bool = False,
) -> JobDescription:
    """
    Check for near-duplicate JDs, call the AI parser, and return an unsaved
    JobDescription instance.

    Raises 409 (with the candidate duplicates in `detail`) instead of
    parsing when a near-duplicate is found and `force` is False — the
    frontend shows those to the user and resubmits with force=True to
    proceed anyway.
    """
    if not jd_text.strip():
        raise HTTPException(status_code=422, detail="Job description text cannot be empty.")

    if not force:
        existing = db.query(JobDescription).filter(JobDescription.uploaded_by == user_id).all()
        duplicates = find_similar_jds(existing, title, jd_text)
        if duplicates:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "This looks similar to an existing job description.",
                    "duplicates": duplicates,
                },
            )

    try:
        parsed = parse_jd(jd_text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"AI parsing failed: {e}. Please try again.",
        )

    return JobDescription(
        title               = title.strip(),
        company             = company.strip() or None,
        jd_text             = jd_text,
        required_skills     = parsed.get("required_skills",     []),
        nice_to_have_skills = parsed.get("nice_to_have_skills", []),
        experience_min      = parsed.get("experience_min",      0),
        experience_max      = parsed.get("experience_max",      99),
        education_required  = parsed.get("education_required"),
        employment_type     = parsed.get("employment_type"),
        location            = parsed.get("location"),
        responsibilities    = parsed.get("responsibilities",    []),
        benefits            = parsed.get("benefits",            []),
        salary_range        = parsed.get("salary_range"),
        jd_summary          = parsed.get("jd_summary"),
        uploaded_by         = user_id,
        **DEFAULT_WEIGHTS,
    )


# ─────────────────────────────────────────────────────────────
# POST  /jobs/  – create from plain text
# ─────────────────────────────────────────────────────────────
@router.post("/", response_model=JDOut, status_code=status.HTTP_201_CREATED)
def create_jd(
    payload:      JDCreate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Accept raw JD text.  Claude AI extracts structured fields automatically.
    Returns the saved JD with all parsed data.
    """
    jd = _build_jd_from_text(
        payload.title,
        payload.company or "",
        payload.jd_text,
        current_user.id,
        db,
        force=payload.force,
    )
    db.add(jd)
    db.commit()
    db.refresh(jd)
    return jd


# ─────────────────────────────────────────────────────────────
# POST  /jobs/upload-file  – upload PDF / DOCX / TXT
# ─────────────────────────────────────────────────────────────
@router.post("/upload-file", response_model=JDOut, status_code=status.HTTP_201_CREATED)
async def upload_jd_file(
    title:   str        = Form(...),
    company: str        = Form(""),
    force:   bool       = Form(False),
    file:    UploadFile = File(...),
    db:      Session    = Depends(get_db),
    current_user: User  = Depends(get_current_user),
):
    """
    Upload a PDF, DOCX, or TXT job description file.
    Text is extracted, sent through AI parsing, and the result is stored.
    """
    file_bytes = await file.read()

    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(file_bytes) // 1024} KB). Maximum is 10 MB.",
        )

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Uploaded file is empty.")

    jd_text = _extract_text(file_bytes, file.content_type or "", file.filename or "")

    jd = _build_jd_from_text(title, company, jd_text, current_user.id, db, force=force)
    db.add(jd)
    db.commit()
    db.refresh(jd)
    return jd


# ─────────────────────────────────────────────────────────────
# GET  /jobs/  – list all JDs for current user
# ─────────────────────────────────────────────────────────────
@router.get("/", response_model=List[JDOut])
def list_jds(
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """Return all job descriptions for the logged-in user, newest first."""
    return (
        db.query(JobDescription)
        .filter(JobDescription.uploaded_by == current_user.id)
        .order_by(JobDescription.created_at.desc())
        .all()
    )


# ─────────────────────────────────────────────────────────────
# GET  /jobs/{id}  – get one JD
# ─────────────────────────────────────────────────────────────
@router.get("/{jd_id}", response_model=JDOut)
def get_jd(
    jd_id: int,
    db:    Session = Depends(get_db),
    _:     User    = Depends(get_current_user),
):
    jd = db.query(JobDescription).filter(JobDescription.id == jd_id).first()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found.")
    return jd


# ─────────────────────────────────────────────────────────────
# PATCH  /jobs/{id}/weights  – update matching-score weights (owner only)
# ─────────────────────────────────────────────────────────────
@router.patch("/{jd_id}/weights", response_model=JDOut)
def update_jd_weights(
    jd_id:        int,
    payload:      JDWeightsUpdate,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Update the per-JD scoring weights used by the programmatic matcher
    (services/matching_service.py::compute_match). Must sum to 100.
    """
    total = (
        payload.weight_skills + payload.weight_experience
        + payload.weight_nice_to_have + payload.weight_education
    )
    if abs(total - 100.0) > WEIGHTS_SUM_TOLERANCE:
        raise HTTPException(
            status_code=422,
            detail=f"Weights must sum to 100 (got {total:.1f}).",
        )

    jd = db.query(JobDescription).filter(
        JobDescription.id         == jd_id,
        JobDescription.uploaded_by == current_user.id,
    ).first()
    if not jd:
        raise HTTPException(
            status_code=404,
            detail="Job description not found or you don't have permission to edit it.",
        )

    jd.weight_skills       = payload.weight_skills
    jd.weight_experience   = payload.weight_experience
    jd.weight_nice_to_have = payload.weight_nice_to_have
    jd.weight_education    = payload.weight_education
    db.commit()
    db.refresh(jd)
    return jd


# ─────────────────────────────────────────────────────────────
# DELETE  /jobs/{id}  – delete (owner only)
# ─────────────────────────────────────────────────────────────
@router.delete("/{jd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_jd(
    jd_id: int,
    db:    Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    jd = db.query(JobDescription).filter(
        JobDescription.id == jd_id,
        JobDescription.uploaded_by == current_user.id,
    ).first()
    if not jd:
        raise HTTPException(
            status_code=404,
            detail="Job description not found or you don't have permission to delete it.",
        )
    db.delete(jd)
    db.commit()
