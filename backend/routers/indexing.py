"""
routers/indexing.py
────────────────────
Indexing Pipeline — resume upload, incremental indexing, and status.

Endpoints:
  POST   /indexing/upload              Upload one or more resume files (PDF/DOCX/TXT)
  GET    /indexing/resumes             List uploaded files with indexed/pending status
  DELETE /indexing/resumes/{filename}  Delete an uploaded resume file (+ its DB profile)
  POST   /indexing/run                 Index only NEW (unindexed) files — incremental
  POST   /indexing/reindex             Force re-index all files in the folder
  GET    /indexing/status              Count + list of indexed candidate profiles
  DELETE /indexing/reset               Remove all indexed profiles (keeps files on disk)

Stream-based Drive folder IDs (set in .env):
  DIGITAL_DRIVE_FOLDER_ID    — folder for Digital stream resumes
  QA_DRIVE_FOLDER_ID         — folder for QA stream resumes
  SALESFORCE_DRIVE_FOLDER_ID — folder for Salesforce stream resumes
"""

import os
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Body
from sqlalchemy.orm import Session

from database import get_db
from models import CandidateProfile
from schemas import (
    IndexingRequest, IndexingResult, IndexingStatusOut, CandidateProfileOut,
    ResumeFileOut, ResumesListOut, VALID_STREAMS,
)
from routers.auth import get_current_user
from services.indexing_service import index_resume_folder, index_local_resumes, index_drive_folder
from services.resume_storage_service import (
    save_uploaded_file,
    list_resume_files,
    delete_resume_file,
)

# ── Sample Drive folder IDs per stream (replace with real IDs when available) ──
STREAM_DRIVE_FOLDERS = {
    "Digital":    os.getenv("DIGITAL_DRIVE_FOLDER_ID",    "sample_digital_drive_folder_id"),
    "QA":         os.getenv("QA_DRIVE_FOLDER_ID",         "sample_qa_drive_folder_id"),
    "Salesforce": os.getenv("SALESFORCE_DRIVE_FOLDER_ID", "sample_salesforce_drive_folder_id"),
}

router = APIRouter(prefix="/indexing", tags=["Indexing"])


# ─────────────────────────────────────────────────────────────
# Shared helper: merge two result dicts
# ─────────────────────────────────────────────────────────────
def _merge_results(a: dict, b: dict) -> dict:
    return {
        "total":   a["total"]   + b["total"],
        "indexed": a["indexed"] + b["indexed"],
        "skipped": a["skipped"] + b["skipped"],
        "updated": a.get("updated", 0) + b.get("updated", 0),
        "errors":  a["errors"]  + b["errors"],
    }


# ─────────────────────────────────────────────────────────────
# POST /indexing/upload
# ─────────────────────────────────────────────────────────────
@router.post("/upload")
async def upload_resumes(
    files:        List[UploadFile] = File(...),
    db:           Session          = Depends(get_db),
    current_user                   = Depends(get_current_user),
):
    """
    Upload one or more resume files (PDF, DOCX, or TXT).
    Files are saved to the user's resume folder on disk.
    Uploading a file with the same name overwrites it and marks it pending re-indexing.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    saved  = []
    errors = []

    for upload in files:
        try:
            info = save_uploaded_file(upload, current_user.id)
            saved.append(info["filename"])

            # Remove old DB profile so the file gets re-indexed on next run
            try:
                db.query(CandidateProfile).filter(
                    CandidateProfile.source_file_id == info["filename"],
                    CandidateProfile.user_id        == current_user.id,
                ).delete()
                db.commit()
            except Exception as db_err:
                db.rollback()
                print(f"[Indexing/Upload] DB cleanup warning for {info['filename']}: {db_err}")

        except ValueError as e:
            errors.append(f"{upload.filename}: {e}")
        except Exception as e:
            errors.append(f"{upload.filename}: unexpected error — {e}")

    if not saved and errors:
        raise HTTPException(status_code=400, detail="; ".join(errors))

    return {
        "saved":   saved,
        "errors":  errors,
        "message": f"{len(saved)} file(s) uploaded successfully."
        + (f" {len(errors)} failed." if errors else ""),
    }


# ─────────────────────────────────────────────────────────────
# GET /indexing/resumes
# ─────────────────────────────────────────────────────────────
@router.get("/resumes", response_model=ResumesListOut)
def list_resumes(
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """List all uploaded resume files with their indexing status."""
    try:
        folder_files = list_resume_files(current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read resume folder: {e}")

    try:
        indexed_rows = (
            db.query(CandidateProfile.source_file_id, CandidateProfile.file_name, CandidateProfile.candidate_name)
            .filter(CandidateProfile.user_id == current_user.id)
            .all()
        )
        # Match by file_name OR source_file_id (covers both uploaded and Drive-indexed resumes)
        indexed_by_filename   = {row.file_name:        row.candidate_name for row in indexed_rows}
        indexed_by_source_id  = {row.source_file_id:   row.candidate_name for row in indexed_rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query indexed profiles: {e}")

    files_out = []
    for f in folder_files:
        fname = f["filename"]
        candidate_name = indexed_by_filename.get(fname) or indexed_by_source_id.get(fname)
        is_indexed = candidate_name is not None
        files_out.append(ResumeFileOut(
            filename       = fname,
            file_size_kb   = f["file_size_kb"],
            uploaded_at    = f["uploaded_at"],
            is_indexed     = is_indexed,
            candidate_name = candidate_name,
        ))

    # Also count DB profiles that may not have a local file (e.g. Drive-only indexed)
    total_db_indexed = len(indexed_rows)
    file_indexed_count = sum(1 for f in files_out if f.is_indexed)
    indexed_count = max(file_indexed_count, total_db_indexed)
    pending_count = len(files_out) - file_indexed_count

    return ResumesListOut(
        total_files   = len(files_out),
        indexed_count = indexed_count,
        pending_count = pending_count,
        files         = files_out,
    )


# ─────────────────────────────────────────────────────────────
# DELETE /indexing/resumes/{filename}
# ─────────────────────────────────────────────────────────────
@router.delete("/resumes/{filename}")
def delete_resume(
    filename:     str,
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """Delete an uploaded resume file and its indexed DB profile (if any)."""
    try:
        db.query(CandidateProfile).filter(
            CandidateProfile.source_file_id == filename,
            CandidateProfile.user_id        == current_user.id,
        ).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to remove DB profile: {e}")

    try:
        removed = delete_resume_file(filename, current_user.id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file from disk: {e}")

    if not removed:
        raise HTTPException(status_code=404, detail=f"File '{filename}' not found.")

    return {"message": f"'{filename}' deleted."}


# ─────────────────────────────────────────────────────────────
# POST /indexing/run  (incremental — only new files)
# ─────────────────────────────────────────────────────────────
@router.post("/run", response_model=IndexingResult)
def run_indexing(
    payload:      IndexingRequest = Body(default=IndexingRequest()),
    db:           Session         = Depends(get_db),
    current_user                  = Depends(get_current_user),
):
    """
    Incremental indexing — indexes only NEW files not yet in the DB.

    Sources:
      1. Stream-specific Google Drive folders for each selected stream
         (Digital / QA / Salesforce checkboxes — uses STREAM_DRIVE_FOLDERS mapping)
      2. Locally uploaded resumes (always included)

    Pass {"streams": ["Digital", "QA"]} to index from those Drive folders.
    Pass {"streams": []} (default) to skip Drive and only process local uploads.
    """
    streams = [s for s in payload.streams if s in VALID_STREAMS]
    print(f"[Indexing] Incremental run for user {current_user.id} | streams={streams or 'local only'}")

    combined = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    # 1. Index from each selected stream's Drive folder
    for stream in streams:
        folder_id = STREAM_DRIVE_FOLDERS.get(stream, "")
        if not folder_id:
            combined["errors"].append(f"{stream}: no Drive folder configured.")
            continue

        if not current_user.access_token:
            combined["errors"].append(
                f"{stream}: no Google access token — sign out and sign in again."
            )
            continue

        print(f"[Indexing] Scanning {stream} Drive folder: {folder_id}")
        try:
            result = index_drive_folder(
                access_token = current_user.access_token,
                folder_id    = folder_id,
                user_id      = current_user.id,
                db           = db,
                skip_indexed = True,
                stream       = stream,
            )
            combined = _merge_results(combined, result)
        except Exception as e:
            combined["errors"].append(f"{stream} Drive indexing failed: {e}")
            print(f"[Indexing] {stream} Drive error: {e}")

    # 2. Index locally uploaded files (no stream tag — stream=None)
    try:
        local_result = index_resume_folder(
            user_id      = current_user.id,
            db           = db,
            skip_indexed = True,
            stream       = None,
        )
        combined = _merge_results(combined, local_result)
    except Exception as e:
        combined["errors"].append(f"Local indexing failed unexpectedly: {e}")
        print(f"[Indexing] Local error: {e}")

    print(
        f"[Indexing] Done — {combined['indexed']} new, "
        f"{combined['skipped']} skipped, {len(combined['errors'])} errors"
    )
    return IndexingResult(**combined)


# ─────────────────────────────────────────────────────────────
# POST /indexing/reindex  (full refresh — re-process everything)
# ─────────────────────────────────────────────────────────────
@router.post("/reindex", response_model=IndexingResult)
def reindex_all(
    payload:      IndexingRequest = Body(default=IndexingRequest()),
    db:           Session         = Depends(get_db),
    current_user                  = Depends(get_current_user),
):
    """
    Full re-index — re-parses ALL files from the selected stream Drive folders
    + local uploads, overwriting existing DB profiles.

    Pass {"streams": ["Digital", "QA"]} to re-index from those Drive folders.
    """
    streams = [s for s in payload.streams if s in VALID_STREAMS]
    print(f"[Indexing] Full reindex for user {current_user.id} | streams={streams or 'local only'}")

    combined = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    # 1. Re-index from each selected stream's Drive folder
    for stream in streams:
        folder_id = STREAM_DRIVE_FOLDERS.get(stream, "")
        if not folder_id:
            combined["errors"].append(f"{stream}: no Drive folder configured.")
            continue

        if not current_user.access_token:
            combined["errors"].append(
                f"{stream}: no Google access token — sign out and sign in again."
            )
            continue

        print(f"[Indexing] Re-scanning {stream} Drive folder: {folder_id}")
        try:
            result = index_drive_folder(
                access_token = current_user.access_token,
                folder_id    = folder_id,
                user_id      = current_user.id,
                db           = db,
                skip_indexed = False,
                stream       = stream,
            )
            combined = _merge_results(combined, result)
        except Exception as e:
            combined["errors"].append(f"{stream} Drive re-indexing failed: {e}")
            print(f"[Indexing] {stream} Drive error: {e}")

    # 2. Re-index local uploads
    try:
        local_result = index_resume_folder(
            user_id      = current_user.id,
            db           = db,
            skip_indexed = False,
            stream       = None,
        )
        combined = _merge_results(combined, local_result)
    except Exception as e:
        combined["errors"].append(f"Local re-indexing failed unexpectedly: {e}")
        print(f"[Indexing] Local error: {e}")

    print(
        f"[Indexing] Done — {combined['indexed']} indexed, {len(combined['errors'])} errors"
    )
    return IndexingResult(**combined)


# ─────────────────────────────────────────────────────────────
# GET /indexing/status
# ─────────────────────────────────────────────────────────────
@router.get("/status", response_model=IndexingStatusOut)
def get_indexing_status(
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """Return indexed candidate profiles count and their metadata."""
    try:
        profiles = (
            db.query(CandidateProfile)
            .filter(CandidateProfile.user_id == current_user.id)
            .order_by(CandidateProfile.indexed_at.desc())
            .all()
        )
        return IndexingStatusOut(
            total_indexed = len(profiles),
            profiles      = [CandidateProfileOut.model_validate(p) for p in profiles],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch indexing status: {e}")


# ─────────────────────────────────────────────────────────────
# DELETE /indexing/reset  (clear DB profiles, keep files on disk)
# ─────────────────────────────────────────────────────────────
@router.delete("/reset")
def reset_indexing(
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """
    Remove all indexed profiles from the DB for this user.
    Files on disk are NOT deleted — run indexing again to re-index them.
    """
    try:
        deleted = db.query(CandidateProfile).delete()
        db.commit()
        print(f"[Indexing] Reset — deleted {deleted} profiles (all users)")
        return {
            "deleted": deleted,
            "message": f"Cleared {deleted} indexed profile(s). Files on disk are unchanged.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset indexed profiles: {e}")
