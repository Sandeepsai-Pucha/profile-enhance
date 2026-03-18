"""
routers/candidates.py
──────────────────────
CRUD endpoints for CandidateProfile plus Google Drive sync.

  GET  /candidates/           – list all active candidates
  GET  /candidates/{id}       – get single candidate
  POST /candidates/           – create candidate manually
  PUT  /candidates/{id}       – update candidate
  DELETE /candidates/{id}     – soft-delete (is_active=False)
  POST /candidates/sync-drive – pull resumes from Google Drive
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import Text
from typing import List, Optional

from database import get_db
from models import CandidateProfile
from schemas import CandidateProfileCreate, CandidateProfileOut
from routers.auth import get_current_user
from models import User
from services.google_drive_service import sync_drive_resumes

router = APIRouter(prefix="/candidates", tags=["Candidates"])


# ─────────────────────────────────────────────────────────────
# LIST ALL CANDIDATES
# ─────────────────────────────────────────────────────────────
@router.get("/", response_model=List[CandidateProfileOut])
def list_candidates(
    skill: Optional[str]  = Query(None, description="Filter by skill (partial match)"),
    role:  Optional[str]  = Query(None, description="Filter by current_role"),
    min_exp: float        = Query(0,    description="Minimum years of experience"),
    limit:   int          = Query(50,   le=200),
    offset:  int          = Query(0),
    db: Session           = Depends(get_db),
    _: User               = Depends(get_current_user),  # requires login
):
    """
    Return active candidate profiles with optional filters.
    Supports pagination via limit/offset.
    """
    query = db.query(CandidateProfile).filter(CandidateProfile.is_active == True)

    if skill:
        # JSON array: use LIKE on the serialised column (works on both SQLite and PostgreSQL)
        query = query.filter(CandidateProfile.skills.cast(Text).ilike(f"%{skill}%"))

    if role:
        query = query.filter(CandidateProfile.current_role.ilike(f"%{role}%"))

    if min_exp:
        query = query.filter(CandidateProfile.experience_years >= min_exp)

    total   = query.count()
    results = query.offset(offset).limit(limit).all()

    return results


# ─────────────────────────────────────────────────────────────
# GET SINGLE CANDIDATE
# ─────────────────────────────────────────────────────────────
@router.get("/{candidate_id}", response_model=CandidateProfileOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """Fetch one candidate by primary key."""
    candidate = db.query(CandidateProfile).filter(
        CandidateProfile.id == candidate_id,
        CandidateProfile.is_active == True,
    ).first()

    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    return candidate


# ─────────────────────────────────────────────────────────────
# CREATE CANDIDATE MANUALLY
# ─────────────────────────────────────────────────────────────
@router.post("/", response_model=CandidateProfileOut, status_code=201)
def create_candidate(
    payload: CandidateProfileCreate,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """
    Manually add a candidate (useful for walk-in profiles
    not stored in Google Drive).
    """
    # Check duplicate email
    existing = db.query(CandidateProfile).filter(
        CandidateProfile.email == payload.email
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Candidate with this email already exists")

    candidate = CandidateProfile(**payload.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


# ─────────────────────────────────────────────────────────────
# UPDATE CANDIDATE
# ─────────────────────────────────────────────────────────────
@router.put("/{candidate_id}", response_model=CandidateProfileOut)
def update_candidate(
    candidate_id: int,
    payload: CandidateProfileCreate,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """Update any field on an existing candidate."""
    candidate = db.query(CandidateProfile).filter(
        CandidateProfile.id == candidate_id
    ).first()

    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(candidate, field, value)

    db.commit()
    db.refresh(candidate)
    return candidate


# ─────────────────────────────────────────────────────────────
# SOFT DELETE
# ─────────────────────────────────────────────────────────────
@router.delete("/{candidate_id}", status_code=204)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """Soft-delete: set is_active=False so history is preserved."""
    candidate = db.query(CandidateProfile).filter(
        CandidateProfile.id == candidate_id
    ).first()

    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    candidate.is_active = False
    db.commit()


# ─────────────────────────────────────────────────────────────
# SYNC FROM GOOGLE DRIVE
# ─────────────────────────────────────────────────────────────
@router.post("/sync-drive")
def sync_from_drive(
    folder_id: Optional[str] = Query(None, description="Google Drive folder ID to scan"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pull all PDF/DOCX resume files from the logged-in user's
    Google Drive and upsert them as CandidateProfiles.
    Requires that the user granted Drive read scope during OAuth.
    """
    if not current_user.access_token:
        raise HTTPException(
            status_code=403,
            detail="No Google Drive access token. Please log in again with Drive scope."
        )

    count = sync_drive_resumes(current_user.access_token, db, folder_id)
    return {"message": f"Synced {count} candidate profile(s) from Google Drive"}
