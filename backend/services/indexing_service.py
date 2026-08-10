"""
services/indexing_service.py
─────────────────────────────
Indexing Pipeline — converts resume text into a structured PageIndex tree
and stores it in the candidate_profiles table.

Two entry points:
  index_resume_folder()  — folder-based incremental indexing (new primary path)
  index_local_resumes()  — legacy single-file path (kept for sample-resumes.txt)

Flow:
  resume file → extract text → parse_resume() AI call (concurrent) → build_page_index() → store in DB
"""

import os
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple, Set

from sqlalchemy.orm import Session

from models import CandidateProfile, FailedParse
from services.bm25_service import build_bm25_corpus
from services.resume_chunking import parse_resume_chunked

# Dynamic AI provider import (mirrors pipeline.py)
_AI_PROVIDER = os.getenv("AI_PROVIDER", "claude").lower()
if _AI_PROVIDER == "claude":
    from services.claude_service import parse_resume, MAX_RESUME_CHARS
elif _AI_PROVIDER == "ollama":
    from services.ollama_service import parse_resume, MAX_RESUME_CHARS
elif _AI_PROVIDER == "groq":
    from services.groq_service import parse_resume, MAX_RESUME_CHARS
else:
    from services.ai_service import parse_resume, MAX_RESUME_CHARS


# ─────────────────────────────────────────────────────────────
# PageIndex tree builder
# ─────────────────────────────────────────────────────────────
def build_page_index(parsed: dict, raw_text: str = "") -> dict:
    """
    Build a hierarchical PageIndex tree from a parsed resume dict.

    This tree is what gets stored in the DB and fed to the LLM during
    the matching pipeline — structured enough for precise reasoning.
    """
    work_history = parsed.get("work_history") or []
    timeline = [
        {
            "title":                wh.get("title"),
            "company":              wh.get("company"),
            "duration":             wh.get("duration"),
            "technologies":         wh.get("technologies") or "",
            "description":          wh.get("description") or "",
            "key_responsibilities": wh.get("responsibilities") or [],
        }
        for wh in work_history
    ]

    return {
        "identity": {
            "name":             parsed.get("name", "Unknown"),
            "email":            parsed.get("email"),
            "phone":            parsed.get("phone"),
            "current_role":     parsed.get("current_role"),
            "experience_years": float(parsed.get("experience_years") or 0),
        },
        "skills": {
            "all": parsed.get("skills") or [],
        },
        "experience": {
            "years":    float(parsed.get("experience_years") or 0),
            "timeline": timeline,
        },
        "education": {
            "summary":         parsed.get("education"),
            "certifications":  parsed.get("certifications") or [],
        },
        "narrative": {
            "summary":        parsed.get("summary"),
            "summary_points": parsed.get("summary_points") or [],
        },
    }


# ─────────────────────────────────────────────────────────────
# Local resume file parser
# ─────────────────────────────────────────────────────────────
def _split_local_file(file_path: str) -> List[Dict[str, str]]:
    """
    Read a local resume file split by ===RESUME N=== markers.
    Returns list of {id, name, text} dicts.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except FileNotFoundError:
        raise FileNotFoundError(f"Resume file not found: {file_path}")

    parts = re.split(r"===RESUME\s*\d+===", raw, flags=re.IGNORECASE)
    resumes = []
    for i, part in enumerate(parts):
        text = part.strip()
        if not text:
            continue
        first_line = next((l.strip() for l in text.splitlines() if l.strip()), f"Candidate {i}")
        name = first_line.replace("Name:", "").strip() if first_line.lower().startswith("name:") else first_line
        resumes.append({
            "id":   f"local-{i}",
            "name": f"{name}.txt",
            "text": text,
        })
    return resumes


# ─────────────────────────────────────────────────────────────
# AI-only parse step (no DB) — safe to run in threads
# ─────────────────────────────────────────────────────────────
def _parse_only(
    source_file_id: str,
    file_name:      str,
    resume_text:    str,
) -> Tuple[str, str, Any, Any]:
    """
    Run the AI parse call and build the page_index + bm25_corpus.
    Returns (source_file_id, file_name, parsed_data_dict, error_or_None).
    No DB access — safe to call from multiple threads simultaneously.
    """
    try:
        parsed      = parse_resume_chunked(parse_resume, resume_text, resume_label=file_name,
                                            chunk_chars=MAX_RESUME_CHARS)
        page_index  = build_page_index(parsed, resume_text)
        bm25_corpus = build_bm25_corpus(parsed)
        return source_file_id, file_name, {
            "parsed":      parsed,
            "page_index":  page_index,
            "bm25_corpus": bm25_corpus,
        }, None
    except Exception as e:
        return source_file_id, file_name, None, str(e)


# ─────────────────────────────────────────────────────────────
# Failed-parse tracking — never drop a failure silently
# ─────────────────────────────────────────────────────────────
def _record_failed_parse(
    db:             Session,
    source_file_id: str,
    file_name:      str,
    user_id:        int,
    error:          str,
    attempts:       int = 1,
    stream:         Optional[str] = None,
) -> None:
    """
    Persist a resume that failed to parse after all retries were exhausted,
    so it's visible and can be reprocessed later instead of just vanishing
    from the results. Upserts — repeated failures on the same file update
    the same row (incrementing attempts) rather than piling up duplicates.
    """
    timestamp = datetime.utcnow()
    print(
        f"[Indexing] PARSE FAILED — file='{file_name}' source_id='{source_file_id}' "
        f"user={user_id} attempts={attempts} at={timestamp.isoformat()} error={error}"
    )
    try:
        existing = db.query(FailedParse).filter(
            FailedParse.source_file_id == source_file_id,
            FailedParse.user_id        == user_id,
        ).first()
        if existing:
            existing.error     = error
            existing.attempts  = (existing.attempts or 0) + attempts
            existing.file_name = file_name
            existing.stream    = stream
            existing.failed_at = timestamp
        else:
            db.add(FailedParse(
                source_file_id = source_file_id,
                file_name      = file_name,
                user_id        = user_id,
                stream         = stream,
                error          = error,
                attempts       = attempts,
                failed_at      = timestamp,
            ))
        db.commit()
    except Exception as e:
        db.rollback()
        # Even the failure-tracking write failed — this must still not be
        # swallowed silently, so it goes to the server log at minimum.
        print(f"[Indexing] Could not persist failed-parse record for {file_name}: {e}")


def _clear_failed_parse(db: Session, source_file_id: str, user_id: int) -> None:
    """Remove a failed_parses row once that file successfully indexes."""
    try:
        db.query(FailedParse).filter(
            FailedParse.source_file_id == source_file_id,
            FailedParse.user_id        == user_id,
        ).delete()
        db.commit()
    except Exception:
        db.rollback()


# ─────────────────────────────────────────────────────────────
# DB upsert step — must run on the main thread (single session)
# ─────────────────────────────────────────────────────────────
def _upsert(
    source_file_id: str,
    file_name:      str,
    data:           dict,
    user_id:        int,
    db:             Session,
    stream:         Optional[str] = None,
) -> Tuple[bool, str]:
    """
    Write one parsed resume result to the DB (upsert). Only ever called
    after parse_resume() returned successfully — a real, validated response,
    never a partial/failed one (see _parse_only below).
    """
    try:
        parsed      = data["parsed"]
        page_index  = data["page_index"]
        bm25_corpus = data["bm25_corpus"]

        existing = db.query(CandidateProfile).filter(
            CandidateProfile.source_file_id == source_file_id,
            CandidateProfile.user_id        == user_id,
        ).first()

        if existing:
            existing.file_name        = file_name
            existing.page_index       = page_index
            existing.bm25_corpus      = bm25_corpus
            existing.candidate_name   = parsed.get("name", "Unknown")
            existing.current_role     = parsed.get("current_role")
            existing.experience_years = float(parsed.get("experience_years") or 0)
            existing.skills           = parsed.get("skills") or []
            existing.stream           = stream
            existing.indexed_at       = datetime.utcnow()
            db.commit()
            _clear_failed_parse(db, source_file_id, user_id)
            return True, f"Updated: {file_name}"
        else:
            db.add(CandidateProfile(
                source_file_id   = source_file_id,
                file_name        = file_name,
                user_id          = user_id,
                page_index       = page_index,
                bm25_corpus      = bm25_corpus,
                candidate_name   = parsed.get("name", "Unknown"),
                current_role     = parsed.get("current_role"),
                experience_years = float(parsed.get("experience_years") or 0),
                skills           = parsed.get("skills") or [],
                stream           = stream,
                indexed_at       = datetime.utcnow(),
            ))
            db.commit()
            _clear_failed_parse(db, source_file_id, user_id)
            return True, f"Indexed: {file_name}"
    except Exception as e:
        db.rollback()
        return False, f"Failed to store {file_name}: {e}"


# ─────────────────────────────────────────────────────────────
# Legacy single-resume entry point (kept for compatibility)
# ─────────────────────────────────────────────────────────────
def index_one_resume(
    source_file_id: str,
    file_name:      str,
    resume_text:    str,
    user_id:        int,
    db:             Session,
    stream:         Optional[str] = None,
) -> Tuple[bool, str]:
    """Parse one resume and upsert into DB. Returns (success, message)."""
    fid, fname, data, err = _parse_only(source_file_id, file_name, resume_text)
    if err:
        return False, f"Failed to index {file_name}: {err}"
    return _upsert(fid, fname, data, user_id, db, stream=stream)


# ─────────────────────────────────────────────────────────────
# Sequential parse helper — one resume at a time, no partial parses
# ─────────────────────────────────────────────────────────────
def _parse_sequential(
    items: List[Tuple[str, str, str]],   # [(source_file_id, file_name, text), ...]
) -> List[Any]:
    """
    Parse resumes one by one. Each resume is fully parsed before moving to
    the next — guarantees no partial parses.

    Retry-on-429 used to live in a loop here, but it never actually worked:
    parse_resume() swallowed every error internally and returned a fake
    empty profile instead of raising, so this loop's `except` branch never
    saw a real error to retry. That retry logic now lives at the source —
    in groq_service.py's _call_groq(), via call_groq_with_retry() — which
    can see and act on the actual 429 response (Retry-After header, etc.).
    This function just calls _parse_only() once per resume and lets a
    genuine failure (rate-limit retries exhausted, unparseable response)
    propagate through as `err` for the caller to record.
    """
    results = []
    for sid, fname, text in items:
        print(f"[Indexing] Parsing: {fname}")
        results.append(_parse_only(sid, fname, text))
    return results
# ─────────────────────────────────────────────────────────────
# Index all resumes from a local file
# ─────────────────────────────────────────────────────────────
def index_local_resumes(
    file_path: str,
    user_id:   int,
    db:        Session,
    stream:    Optional[str] = None,
) -> Dict[str, Any]:
    try:
        resumes = _split_local_file(file_path)
    except FileNotFoundError as e:
        return {"total": 0, "indexed": 0, "updated": 0, "skipped": 0, "errors": [str(e)]}

    # ── Sequential AI parsing (one resume at a time) ─────────
    items = [(r["id"], r["name"], r["text"]) for r in resumes]
    print(f"[Indexing] Parsing {len(items)} resumes sequentially")
    parse_results = _parse_sequential(items)

    # ── Sequential DB writes ──────────────────────────────────
    indexed, updated, errors = 0, 0, []
    for sid, fname, data, err in parse_results:
        if err:
            errors.append(f"Failed to parse {fname}: {err}")
            _record_failed_parse(db, sid, fname, user_id, str(err), stream=stream)
            continue
        ok, msg = _upsert(sid, fname, data, user_id, db, stream=stream)
        if ok:
            updated += 1 if msg.startswith("Updated") else 0
            indexed += 0 if msg.startswith("Updated") else 1
            print(f"[Indexing] {msg}")
        else:
            errors.append(msg)
            print(f"[Indexing] ERROR: {msg}")

    return {"total": len(resumes), "indexed": indexed, "skipped": 0, "updated": updated, "errors": errors}


# ─────────────────────────────────────────────────────────────
# INDEX resumes from a Google Drive folder
# ─────────────────────────────────────────────────────────────
def index_drive_folder(
    access_token: str,
    folder_id:    str,
    user_id:      int,
    db:           Session,
    skip_indexed: bool = True,
    stream:       Optional[str] = None,
) -> Dict[str, Any]:
    from services.google_drive_service import list_resume_files as drive_list_files
    from services.google_drive_service import download_and_parse_resume

    try:
        files = drive_list_files(access_token, folder_id)
    except Exception as e:
        return {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": [f"Drive list failed: {e}"]}

    if not files:
        return {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    already_indexed: Set[str] = set()
    if skip_indexed:
        rows = db.query(CandidateProfile.source_file_id).filter(
            CandidateProfile.user_id == user_id
        ).all()
        already_indexed = {r.source_file_id for r in rows}

    # ── Download text for files that need indexing ────────────
    to_parse: List[Tuple[str, str, str]] = []
    skipped = 0
    errors: List[str] = []

    for f in files:
        if skip_indexed and f["id"] in already_indexed:
            skipped += 1
            print(f"[Indexing/Drive] Skipped (already indexed): {f['name']}")
            continue
        text, err = download_and_parse_resume(access_token, f["id"], f["mimeType"])
        if err or not text:
            errors.append(f"{f['name']}: {err or 'could not extract text'}")
            continue
        to_parse.append((f["id"], f["name"], text))

    if not to_parse:
        return {"total": len(files), "indexed": 0, "skipped": skipped, "updated": 0, "errors": errors}

    # ── Sequential AI parsing (one resume at a time) ─────────
    print(f"[Indexing/Drive] Parsing {len(to_parse)} resumes sequentially")
    parse_results = _parse_sequential(to_parse)

    # ── Sequential DB writes ──────────────────────────────────
    indexed, updated = 0, 0
    for sid, fname, data, err in parse_results:
        if err:
            errors.append(f"Failed to parse {fname}: {err}")
            _record_failed_parse(db, sid, fname, user_id, str(err), stream=stream)
            continue
        ok, msg = _upsert(sid, fname, data, user_id, db, stream=stream)
        if ok:
            updated += 1 if msg.startswith("Updated") else 0
            indexed += 0 if msg.startswith("Updated") else 1
            print(f"[Indexing/Drive] {msg}")
        else:
            errors.append(msg)

    return {"total": len(files), "indexed": indexed, "skipped": skipped, "updated": updated, "errors": errors}


# ─────────────────────────────────────────────────────────────
# PRIMARY: incremental folder-based indexing
# ─────────────────────────────────────────────────────────────
def index_resume_folder(
    user_id:      int,
    db:           Session,
    skip_indexed: bool = True,
    stream:       Optional[str] = None,
) -> Dict[str, Any]:
    from services.resume_storage_service import list_resume_files, extract_text_from_file

    try:
        folder_files = list_resume_files(user_id)
    except Exception as e:
        return {"total": 0, "indexed": 0, "skipped": 0, "updated": 0,
                "errors": [f"Failed to list resume folder: {e}"]}
    if not folder_files:
        return {"total": 0, "indexed": 0, "skipped": 0, "updated": 0, "errors": []}

    already_indexed: Set[str] = set()
    if skip_indexed:
        rows = db.query(CandidateProfile.source_file_id).filter(
            CandidateProfile.user_id == user_id
        ).all()
        already_indexed = {r.source_file_id for r in rows}

    # ── Collect files that need parsing ───────────────────────
    to_parse: List[Tuple[str, str, str]] = []
    skipped = 0
    errors: List[str] = []

    for f in folder_files:
        fname = f["filename"]
        if skip_indexed and fname in already_indexed:
            skipped += 1
            print(f"[Indexing] Skipped (already indexed): {fname}")
            continue
        text = extract_text_from_file(f["file_path"])
        if not text:
            errors.append(f"{fname}: could not extract text (empty or scanned PDF?)")
            continue
        to_parse.append((fname, fname, text))

    if not to_parse:
        return {"total": len(folder_files), "indexed": 0, "skipped": skipped, "updated": 0, "errors": errors}

    # ── Sequential AI parsing (one resume at a time) ─────────
    print(f"[Indexing] Parsing {len(to_parse)} resumes sequentially")
    parse_results = _parse_sequential(to_parse)

    # ── Sequential DB writes ──────────────────────────────────
    indexed, updated = 0, 0
    for sid, fname, data, err in parse_results:
        if err:
            errors.append(f"Failed to parse {fname}: {err}")
            _record_failed_parse(db, sid, fname, user_id, str(err), stream=stream)
            continue
        ok, msg = _upsert(sid, fname, data, user_id, db, stream=stream)
        if ok:
            updated += 1 if msg.startswith("Updated") else 0
            indexed += 0 if msg.startswith("Updated") else 1
            print(f"[Indexing] {msg}")
        else:
            errors.append(msg)
            print(f"[Indexing] ERROR: {msg}")

    return {"total": len(folder_files), "indexed": indexed, "skipped": skipped, "updated": updated, "errors": errors}


# ─────────────────────────────────────────────────────────────
# REPROCESS previously-failed parses (the "failed parses queue", reprocessed)
# ─────────────────────────────────────────────────────────────
def reprocess_failed_parses(
    user_id:      int,
    db:           Session,
    access_token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Re-attempt every failed_parses row for this user.

    Local-upload failures (stream is None) are re-read straight from disk.
    Drive-sourced failures (stream is set) need a live Google access_token
    to re-download — pass one in if available, otherwise those rows are
    reported as skipped rather than silently ignored.
    """
    from services.resume_storage_service import list_resume_files, extract_text_from_file

    failed_rows = db.query(FailedParse).filter(FailedParse.user_id == user_id).all()
    if not failed_rows:
        return {"total": 0, "recovered": 0, "still_failed": 0, "errors": []}

    local_files = {f["filename"]: f["file_path"] for f in list_resume_files(user_id)}
    stream_by_sid = {row.source_file_id: row.stream for row in failed_rows}

    to_parse: List[Tuple[str, str, str]] = []
    errors: List[str] = []

    for row in failed_rows:
        if row.stream:
            if not access_token:
                errors.append(f"{row.file_name}: skipped (Drive-sourced, no access_token provided to reprocess)")
                continue
            from services.google_drive_service import get_file_mime_type, download_and_parse_resume
            mime_type = get_file_mime_type(access_token, row.source_file_id)
            if not mime_type:
                errors.append(f"{row.file_name}: could not look up file on Drive (deleted/moved?)")
                continue
            text, err = download_and_parse_resume(access_token, row.source_file_id, mime_type)
            if err or not text:
                errors.append(f"{row.file_name}: {err or 'could not re-download from Drive'}")
                continue
            to_parse.append((row.source_file_id, row.file_name, text))
        else:
            file_path = local_files.get(row.file_name)
            if not file_path:
                errors.append(f"{row.file_name}: local file no longer exists on disk")
                continue
            text = extract_text_from_file(file_path)
            if not text:
                errors.append(f"{row.file_name}: could not extract text")
                continue
            to_parse.append((row.source_file_id, row.file_name, text))

    if not to_parse:
        return {"total": len(failed_rows), "recovered": 0, "still_failed": len(failed_rows), "errors": errors}

    print(f"[Indexing] Reprocessing {len(to_parse)} previously-failed resume(s) for user {user_id}")
    parse_results = _parse_sequential(to_parse)

    recovered = 0
    for sid, fname, data, err in parse_results:
        stream = stream_by_sid.get(sid)
        if err:
            errors.append(f"Still failing: {fname}: {err}")
            _record_failed_parse(db, sid, fname, user_id, str(err), stream=stream)
            continue
        ok, msg = _upsert(sid, fname, data, user_id, db, stream=stream)
        if ok:
            recovered += 1
            print(f"[Indexing] Recovered: {msg}")
        else:
            errors.append(msg)

    return {
        "total":        len(failed_rows),
        "recovered":    recovered,
        "still_failed": len(failed_rows) - recovered,
        "errors":       errors,
    }
