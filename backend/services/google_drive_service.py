"""
services/google_drive_service.py
─────────────────────────────────
Fetch resume files from Google Drive and extract their text.
NO database writes — all data is returned to the caller in-memory.

Supports PDF, DOCX, and plain-text files.
"""

import io
import PyPDF2
import docx
from typing import List, Dict, Optional, Tuple

from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload
from google.oauth2.credentials import Credentials


# ─────────────────────────────────────────────────────────────
# Build an authenticated Drive API client
# ─────────────────────────────────────────────────────────────
def _get_drive_service(access_token: str):
    creds = Credentials(token=access_token)
    return build("drive", "v3", credentials=creds)


# ─────────────────────────────────────────────────────────────
# Extract plain text from in-memory file bytes
# ─────────────────────────────────────────────────────────────
def _extract_text(file_bytes: bytes, mime_type: str) -> str:
    """
    Extract text from PDF, DOCX, or plain-text bytes.
    Returns empty string if extraction fails.
    """
    try:
        if "pdf" in mime_type:
            reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
            return "\n".join(page.extract_text() or "" for page in reader.pages).strip()

        elif "wordprocessingml" in mime_type or "docx" in mime_type:
            doc = docx.Document(io.BytesIO(file_bytes))
            return "\n".join(p.text for p in doc.paragraphs).strip()

        elif "text/plain" in mime_type:
            return file_bytes.decode("utf-8", errors="replace").strip()

    except Exception as e:
        print(f"[Drive] Text extraction failed ({mime_type}): {e}")

    return ""


# ─────────────────────────────────────────────────────────────
# LIST resume files in Drive (PDF / DOCX / TXT)
# ─────────────────────────────────────────────────────────────
def list_resume_files(
    access_token: str,
    folder_id: Optional[str] = None,
    page_size: int = 100,
) -> List[Dict]:
    """
    Return a list of Drive file metadata dicts:
      {id, name, mimeType, webViewLink}

    If folder_id is given, only files in that folder are returned.
    Otherwise all PDF/DOCX/TXT files in the user's Drive are listed.

    Raises on auth errors so the caller can surface them properly.
    """
    service = _get_drive_service(access_token)

    mime_filter = (
        "mimeType='application/pdf' or "
        "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or "
        "mimeType='text/plain'"
    )
    query = f"({mime_filter}) and trashed=false"
    if folder_id:
        query += f" and '{folder_id}' in parents"

    result = service.files().list(
        q=query,
        fields="files(id, name, mimeType, webViewLink)",
        pageSize=page_size,
        orderBy="name",
    ).execute()

    return result.get("files", [])


# ─────────────────────────────────────────────────────────────
# DOWNLOAD + PARSE a single resume file
# ─────────────────────────────────────────────────────────────
def download_and_parse_resume(
    access_token: str,
    file_id: str,
    mime_type: str,
) -> Tuple[str, Optional[str]]:
    """
    Download one file from Drive and extract its text.

    Returns (text, error_message).
    text is empty and error_message is set on failure.
    """
    try:
        service  = _get_drive_service(access_token)
        request  = service.files().get_media(fileId=file_id)
        fh       = io.BytesIO()
        loader   = MediaIoBaseDownload(fh, request)

        done = False
        while not done:
            _, done = loader.next_chunk()

        fh.seek(0)
        text = _extract_text(fh.read(), mime_type)

        if not text:
            return "", "File downloaded but no text could be extracted (scanned PDF?)"

        return text, None

    except Exception as e:
        return "", str(e)


# ─────────────────────────────────────────────────────────────
# SEARCH Drive folders by name (for the folder picker UI)
# ─────────────────────────────────────────────────────────────
def search_folders(
    access_token: str,
    query: str,
    page_size: int = 20,
) -> List[Dict]:
    """
    Search for Drive folders whose name contains `query`.

    Returns a list of {id, name} dicts.
    """
    try:
        service = _get_drive_service(access_token)
        q = (
            f"mimeType='application/vnd.google-apps.folder' "
            f"and name contains '{query.replace(chr(39), '')}' "
            f"and trashed=false"
        )
        result = service.files().list(
            q=q,
            fields="files(id, name)",
            pageSize=page_size,
            orderBy="name",
        ).execute()
        return result.get("files", [])
    except Exception as e:
        print(f"[Drive] search_folders error: {e}")
        return []


# ─────────────────────────────────────────────────────────────
# HIGH-LEVEL: fetch all resumes as {file_meta, text} dicts
# ─────────────────────────────────────────────────────────────
def fetch_all_resumes(
    access_token: str,
    folder_id: Optional[str] = None,
) -> Tuple[List[Dict], List[str]]:
    """
    List and download all resume files from Drive.

    Returns:
      resumes: list of {id, name, mimeType, webViewLink, text}
      errors:  list of human-readable error strings for failed files
    """
    try:
        files = list_resume_files(access_token, folder_id)
    except Exception as e:
        return [], [f"Could not list Drive files: {e}"]

    resumes: List[Dict] = []
    errors:  List[str]  = []

    for f in files:
        text, err = download_and_parse_resume(access_token, f["id"], f["mimeType"])
        if err:
            errors.append(f"{f['name']}: {err}")
            continue
        resumes.append({**f, "text": text})

    return resumes, errors
