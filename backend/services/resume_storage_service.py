"""
services/resume_storage_service.py
────────────────────────────────────
Manages uploaded resume files on disk.

Storage layout:
  RESUMES_BASE_DIR/
    {user_id}/
      alice_resume.pdf
      bob_cv.docx
      ...

Text extraction supports PDF (PyPDF2), DOCX (python-docx), and TXT.
"""

import os
from datetime import datetime
from typing import List, Dict

import PyPDF2
import docx as _docx
from fastapi import UploadFile

RESUMES_BASE_DIR = os.getenv("RESUMES_DIR", "resumes")
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_FILE_SIZE_MB   = 10


# ─────────────────────────────────────────────────────────────
# Folder helpers
# ─────────────────────────────────────────────────────────────
def get_user_folder(user_id: int) -> str:
    """Return the resume folder for a user, creating it if it doesn't exist."""
    folder = os.path.join(RESUMES_BASE_DIR, str(user_id))
    os.makedirs(folder, exist_ok=True)
    return folder


# ─────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────
def save_uploaded_file(upload: UploadFile, user_id: int) -> Dict:
    """
    Save an uploaded file to the user's resume folder.
    Returns {filename, file_path, file_size_kb}.
    Raises ValueError for unsupported types or oversized files.
    If a file with the same name already exists, it is overwritten.
    """
    original_name = upload.filename or "resume"
    ext = os.path.splitext(original_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    content = upload.file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"File too large ({size_mb:.1f} MB). Maximum is {MAX_FILE_SIZE_MB} MB.")

    folder    = get_user_folder(user_id)
    file_path = os.path.join(folder, original_name)

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except OSError as e:
        raise ValueError(f"Could not save file to disk: {e}")

    return {
        "filename":     original_name,
        "file_path":    file_path,
        "file_size_kb": round(len(content) / 1024, 1),
    }


# ─────────────────────────────────────────────────────────────
# List
# ─────────────────────────────────────────────────────────────
def list_resume_files(user_id: int) -> List[Dict]:
    """
    List all resume files in the user's folder.
    Returns list of {filename, file_path, file_size_kb, uploaded_at}.
    """
    folder = get_user_folder(user_id)
    files  = []
    try:
        entries = sorted(os.listdir(folder))
    except OSError as e:
        print(f"[ResumeStorage] Could not list folder {folder}: {e}")
        return []
    for fname in entries:
        ext = os.path.splitext(fname)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        fpath = os.path.join(folder, fname)
        stat  = os.stat(fpath)
        files.append({
            "filename":     fname,
            "file_path":    fpath,
            "file_size_kb": round(stat.st_size / 1024, 1),
            "uploaded_at":  datetime.fromtimestamp(stat.st_mtime).isoformat(),
        })
    return files


# ─────────────────────────────────────────────────────────────
# Delete
# ─────────────────────────────────────────────────────────────
def delete_resume_file(filename: str, user_id: int) -> bool:
    """
    Delete a resume file from the user's folder.
    Returns True if the file was found and deleted, False otherwise.
    Uses os.path.basename to prevent path traversal.
    """
    safe_name = os.path.basename(filename)
    folder    = get_user_folder(user_id)
    file_path = os.path.join(folder, safe_name)
    if os.path.isfile(file_path):
        os.remove(file_path)
        return True
    return False


# ─────────────────────────────────────────────────────────────
# Text extraction
# ─────────────────────────────────────────────────────────────
def extract_text_from_file(file_path: str) -> str:
    """
    Extract plain text from a PDF, DOCX, or TXT file.
    Returns empty string if extraction fails or file is unreadable.
    """
    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext == ".pdf":
            with open(file_path, "rb") as f:
                reader = PyPDF2.PdfReader(f)
                return "\n".join(
                    page.extract_text() or "" for page in reader.pages
                ).strip()

        elif ext == ".docx":
            doc = _docx.Document(file_path)
            return "\n".join(p.text for p in doc.paragraphs).strip()

        elif ext == ".txt":
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                return f.read().strip()

    except Exception as e:
        print(f"[ResumeStorage] Text extraction failed for {file_path}: {e}")

    return ""
