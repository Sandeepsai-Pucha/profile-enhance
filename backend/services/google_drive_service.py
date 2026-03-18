"""
services/google_drive_service.py
─────────────────────────────────
Handles reading candidate resume files from Google Drive.
Uses the user's OAuth access_token (stored in DB after login)
to call the Drive API on their behalf.

In development / demo mode you can skip real Drive calls
and use seed data instead (set USE_SEED_DATA=true in .env).
"""

import os
import io
import PyPDF2
import docx
from typing import List, Dict, Optional
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.credentials import Credentials
from dotenv import load_dotenv

load_dotenv()

# ── Scopes required for reading Drive files ───────────────────
SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "openid",
    "email",
    "profile",
]


def _get_drive_service(access_token: str):
    """
    Build an authenticated Google Drive API client
    using the user's OAuth access token.
    """
    creds = Credentials(token=access_token)
    return build("drive", "v3", credentials=creds)


# ─────────────────────────────────────────────────────────────
# LIST FILES IN A DRIVE FOLDER
# ─────────────────────────────────────────────────────────────
def list_resume_files(access_token: str, folder_id: Optional[str] = None) -> List[Dict]:
    """
    List PDF and DOCX files in the user's Google Drive
    (optionally scoped to a specific folder).

    Returns list of {id, name, mimeType, webViewLink}
    """
    service = _get_drive_service(access_token)

    # Build query: only PDF and DOCX in the given folder (or root)
    mime_filter = (
        "mimeType='application/pdf' or "
        "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'"
    )
    query = f"({mime_filter}) and trashed=false"
    if folder_id:
        query += f" and '{folder_id}' in parents"

    response = service.files().list(
        q=query,
        fields="files(id, name, mimeType, webViewLink)",
        pageSize=100,
    ).execute()

    return response.get("files", [])


# ─────────────────────────────────────────────────────────────
# DOWNLOAD & PARSE A SINGLE RESUME FILE
# ─────────────────────────────────────────────────────────────
def download_and_parse_resume(access_token: str, file_id: str, mime_type: str) -> str:
    """
    Download a file from Drive and extract plain text.
    Supports PDF and DOCX formats.

    Returns extracted text string (may be empty if parsing fails).
    """
    service = _get_drive_service(access_token)

    # Stream the file content into memory
    request   = service.files().get_media(fileId=file_id)
    fh        = io.BytesIO()
    downloader = MediaIoBaseDownload(fh, request)

    done = False
    while not done:
        _, done = downloader.next_chunk()

    fh.seek(0)
    text = ""

    if mime_type == "application/pdf":
        # Extract text from PDF using PyPDF2
        reader = PyPDF2.PdfReader(fh)
        for page in reader.pages:
            text += (page.extract_text() or "") + "\n"

    elif "wordprocessingml" in mime_type:
        # Extract text from DOCX using python-docx
        document = docx.Document(fh)
        text = "\n".join([para.text for para in document.paragraphs])

    return text.strip()


# ─────────────────────────────────────────────────────────────
# SYNC ALL RESUMES FROM DRIVE INTO OUR DB
# ─────────────────────────────────────────────────────────────
def sync_drive_resumes(access_token: str, db, folder_id: Optional[str] = None) -> int:
    """
    High-level function called by the /candidates/sync endpoint.
    1. Lists all resume files in Drive
    2. Downloads + parses each one
    3. Upserts CandidateProfile rows in the DB

    Returns count of profiles synced.
    """
    from models import CandidateProfile

    files = list_resume_files(access_token, folder_id)
    synced = 0

    for f in files:
        try:
            text = download_and_parse_resume(access_token, f["id"], f["mimeType"])
            if not text:
                continue

            # Derive candidate name from file name (e.g. "John_Doe_Resume.pdf" → "John Doe")
            name = f["name"].replace("_", " ").replace("-", " ")
            for suffix in ["Resume", "CV", ".pdf", ".docx"]:
                name = name.replace(suffix, "").strip()

            # Check if candidate already exists by drive file ID
            existing = db.query(CandidateProfile).filter(
                CandidateProfile.drive_file_id == f["id"]
            ).first()

            if existing:
                # Update resume text
                existing.resume_text     = text
                existing.drive_file_url  = f.get("webViewLink")
            else:
                # Create new candidate profile
                candidate = CandidateProfile(
                    name          = name,
                    email         = f"unknown_{f['id']}@placeholder.com",  # will be enriched later
                    resume_text   = text,
                    drive_file_id = f["id"],
                    drive_file_url= f.get("webViewLink"),
                )
                db.add(candidate)

            synced += 1

        except Exception as e:
            print(f"[Drive Sync] Failed to process file {f['name']}: {e}")
            continue

    db.commit()
    return synced
