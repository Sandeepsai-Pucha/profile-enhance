"""
routers/resume_format.py
─────────────────────────
Standalone resume formatting feature.

  POST /resume-format/convert — upload a resume in any supported format
  (PDF / DOCX / TXT) and get back a .docx reformatted into the ABSYZ
  template (see services/resume_generator.py).

Fully ephemeral: the uploaded file is parsed in-memory and never written
to disk or the DB, consistent with the rest of the app.
"""

import io
import os
import re

import PyPDF2
import docx as _docx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response

from models import User
from routers.auth import get_current_user
from services.indexing_service import build_page_index
from services.resume_generator import build_resume_docx
from services.resume_chunking import parse_resume_chunked

_AI_PROVIDER = os.getenv("AI_PROVIDER", "claude").lower()
if _AI_PROVIDER == "claude":
    from services.claude_service import parse_resume, MAX_RESUME_CHARS, enhance_profile_summary
elif _AI_PROVIDER == "ollama":
    from services.ollama_service import parse_resume, MAX_RESUME_CHARS, enhance_profile_summary
elif _AI_PROVIDER == "groq":
    from services.groq_service import parse_resume, MAX_RESUME_CHARS, enhance_profile_summary
else:
    from services.ai_service import parse_resume, MAX_RESUME_CHARS, enhance_profile_summary

# Profile Summary sections this thin get topped up with AI-generated points
# based on Work Experience / Key Projects — see enhance_profile_summary().
MIN_SUMMARY_POINTS_BEFORE_ENHANCE = 3
NEW_SUMMARY_POINTS_TO_ADD         = 7

router = APIRouter(prefix="/resume-format", tags=["Resume Formatting"])

MAX_FILE_BYTES     = 10 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _extract_text(file_bytes: bytes, filename: str) -> str:
    ext = os.path.splitext(filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{ext}'. Allowed: .pdf, .docx, .txt",
        )

    try:
        if ext == ".pdf":
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        elif ext == ".docx":
            document = _docx.Document(io.BytesIO(file_bytes))
            text = "\n".join(p.text for p in document.paragraphs).strip()
        else:  # .txt
            text = file_bytes.decode("utf-8", errors="replace").strip()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not read file: {e}")

    if not text:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found (scanned/image-based file?).",
        )
    return text


@router.post("/convert")
async def convert_resume_to_absyz_format(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a resume in any supported format and receive it back reformatted
    into the ABSYZ profile template as a downloadable .docx.
    """
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail="File too large. Maximum is 10 MB.")

    resume_text = _extract_text(content, file.filename or "")

    try:
        parsed = parse_resume_chunked(parse_resume, resume_text, resume_label=file.filename or "",
                                       chunk_chars=MAX_RESUME_CHARS)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI parsing failed: {e}. Please try again.")

    # parse_resume() never raises on failure — it returns this exact empty
    # shape and only prints "[<Provider>] parse_resume failed: ..." to the
    # server log. Detect that shape here so a failed AI call surfaces as a
    # real error instead of silently producing a near-blank docx.
    if (not parsed.get("name") or parsed.get("name") == "Unknown") \
            and not parsed.get("skills") \
            and not parsed.get("work_history") \
            and not parsed.get("summary_points"):
        raise HTTPException(
            status_code=502,
            detail=(
                f"AI parsing returned no usable data (AI_PROVIDER={_AI_PROVIDER}). "
                "Check the backend terminal for a 'parse_resume failed' line — "
                "this usually means an invalid/expired API key, a decommissioned "
                "model, or a rate limit."
            ),
        )

    # Profile Summary — prefer bullet points the parser found, fall back to
    # splitting the paragraph summary into sentences (mirrors resume_generator.py).
    summary_points = parsed.get("summary_points") or []
    if not summary_points and parsed.get("summary"):
        pts = re.split(r"\.\s+", parsed["summary"].strip())
        summary_points = [p.strip().rstrip(".") for p in pts if len(p.strip()) > 10]

    if len(summary_points) < MIN_SUMMARY_POINTS_BEFORE_ENHANCE:
        summary_points = enhance_profile_summary(
            parsed, summary_points, min_new=NEW_SUMMARY_POINTS_TO_ADD,
        )
    parsed["summary_points"] = summary_points

    page_index = build_page_index(parsed, resume_text)

    try:
        docx_bytes = build_resume_docx(page_index, new_skills=[])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to build formatted resume: {e}")

    safe_name = (parsed.get("name") or "resume").replace(" ", "_")
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}_ABSYZ_format.docx"'},
    )
