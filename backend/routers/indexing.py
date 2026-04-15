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
"""

import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from database import get_db
from models import CandidateProfile
from schemas import (
    IndexingResult, IndexingStatusOut, CandidateProfileOut,
    ResumeFileOut, ResumesListOut,
)
from routers.auth import get_current_user
from services.indexing_service import index_resume_folder, index_local_resumes, index_drive_folder
from services.resume_storage_service import (
    save_uploaded_file,
    list_resume_files,
    delete_resume_file,
)

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
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """
    Incremental indexing — indexes only NEW files not yet in the DB.

    Sources (both combined):
      1. Default Google Drive folder (DEFAULT_DRIVE_FOLDER_ID in .env)
      2. Locally uploaded resumes (via /indexing/upload)
    """
    print(f"[Indexing] Incremental run for user {current_user.id}")

    # 1. Index from Google Drive folder
    drive_folder_id = os.getenv("DEFAULT_DRIVE_FOLDER_ID", "")
    drive_result    = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    if drive_folder_id and current_user.access_token:
        print(f"[Indexing] Scanning Drive folder: {drive_folder_id}")
        try:
            drive_result = index_drive_folder(
                access_token = current_user.access_token,
                folder_id    = drive_folder_id,
                user_id      = current_user.id,
                db           = db,
                skip_indexed = True,
            )
        except Exception as e:
            drive_result["errors"].append(f"Drive indexing failed unexpectedly: {e}")
            print(f"[Indexing] Drive error: {e}")
    elif drive_folder_id and not current_user.access_token:
        drive_result["errors"].append(
            "Drive folder configured but no Google access token — sign out and sign in again."
        )

    # 2. Index locally uploaded files
    try:
        local_result = index_resume_folder(
            user_id      = current_user.id,
            db           = db,
            skip_indexed = True,
        )
    except Exception as e:
        local_result = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0,
                        "errors": [f"Local indexing failed unexpectedly: {e}"]}
        print(f"[Indexing] Local error: {e}")

    result = _merge_results(drive_result, local_result)
    print(
        f"[Indexing] Done — {result['indexed']} new, "
        f"{result['skipped']} skipped, {len(result['errors'])} errors"
    )
    return IndexingResult(**result)


# ─────────────────────────────────────────────────────────────
# POST /indexing/reindex  (full refresh — re-process everything)
# ─────────────────────────────────────────────────────────────
@router.post("/reindex", response_model=IndexingResult)
def reindex_all(
    db:           Session = Depends(get_db),
    current_user          = Depends(get_current_user),
):
    """
    Full re-index — re-parses ALL files from Drive + local uploads,
    overwriting existing DB profiles.
    """
    print(f"[Indexing] Full reindex for user {current_user.id}")

    # 1. Re-index from Drive
    drive_folder_id = os.getenv("DEFAULT_DRIVE_FOLDER_ID", "")
    drive_result    = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    if drive_folder_id and current_user.access_token:
        print(f"[Indexing] Re-scanning Drive folder: {drive_folder_id}")
        try:
            drive_result = index_drive_folder(
                access_token = current_user.access_token,
                folder_id    = drive_folder_id,
                user_id      = current_user.id,
                db           = db,
                skip_indexed = False,
            )
        except Exception as e:
            drive_result["errors"].append(f"Drive re-indexing failed unexpectedly: {e}")
            print(f"[Indexing] Drive error: {e}")

    # 2. Re-index local uploads
    try:
        local_result = index_resume_folder(
            user_id      = current_user.id,
            db           = db,
            skip_indexed = False,
        )
    except Exception as e:
        local_result = {"total": 0, "indexed": 0, "skipped": 0, "updated": 0,
                        "errors": [f"Local re-indexing failed unexpectedly: {e}"]}
        print(f"[Indexing] Local error: {e}")

    result = _merge_results(drive_result, local_result)
    print(
        f"[Indexing] Done — {result['indexed']} indexed, {len(result['errors'])} errors"
    )
    return IndexingResult(**result)


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
