"""
schemas.py
──────────
Pydantic models used for:
  • Request body validation  (what the client sends)
  • Response serialisation   (what we return as JSON)
Keeps ORM models separate from the API surface.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any
from datetime import datetime


# ═══════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════

class GoogleAuthRequest(BaseModel):
    """Frontend sends the Google OAuth code after user consents."""
    code: str = Field(..., description="Authorization code from Google OAuth redirect")


class TokenResponse(BaseModel):
    """JWT we mint and return to the frontend after successful login."""
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


# ═══════════════════════════════════════════════════════════════
#  USER
# ═══════════════════════════════════════════════════════════════

class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}   # allow ORM → Pydantic conversion


# ═══════════════════════════════════════════════════════════════
#  CANDIDATE PROFILE
# ═══════════════════════════════════════════════════════════════

class CandidateProfileCreate(BaseModel):
    """Used when manually creating a candidate (or from seed data)."""
    name: str
    email: EmailStr
    phone: Optional[str] = None
    current_role: Optional[str] = None
    experience_years: float = 0
    skills: List[str] = []
    education: Optional[str] = None
    summary: Optional[str] = None
    resume_text: Optional[str] = None
    drive_file_id: Optional[str] = None
    drive_file_url: Optional[str] = None


class CandidateProfileOut(CandidateProfileCreate):
    id: int
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
#  JOB DESCRIPTION
# ═══════════════════════════════════════════════════════════════

class JDCreate(BaseModel):
    """Sent when a user uploads a JD (text)."""
    title: str
    company: Optional[str] = None
    jd_text: str


class JDOut(BaseModel):
    id: int
    title: str
    company: Optional[str]
    jd_text: str
    required_skills: List[str]
    experience_min: float
    experience_max: float
    uploaded_by: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
#  MATCHING
# ═══════════════════════════════════════════════════════════════

class MatchRequest(BaseModel):
    """Trigger matching for a specific JD."""
    job_id: int = Field(..., description="ID of the JobDescription to match against")
    top_n: int = Field(5, ge=1, le=20, description="Return top-N candidates")


class InterviewQuestion(BaseModel):
    question: str
    category: str       # e.g. "Technical", "Behavioural", "Situational"
    difficulty: str     # "Easy" | "Medium" | "Hard"


class MatchResultOut(BaseModel):
    id: int
    job_id: int
    candidate_id: int
    candidate: CandidateProfileOut
    match_score: float
    matched_skills: List[str]
    missing_skills: List[str]
    ai_summary: Optional[str]
    interview_questions: List[Any]      # list of InterviewQuestion dicts
    created_at: datetime

    model_config = {"from_attributes": True}


class MatchResponse(BaseModel):
    """Complete response returned after running the matching engine."""
    job: JDOut
    results: List[MatchResultOut]
    total_candidates_evaluated: int


# ═══════════════════════════════════════════════════════════════
#  PROFILE LIBRARY / SKILL CATEGORIES
# ═══════════════════════════════════════════════════════════════

class SkillCategoryOut(BaseModel):
    id: int
    category: str
    skills: List[str]
    roles: List[str]

    model_config = {"from_attributes": True}


# ── resolve forward reference ─────────────────────────────────
TokenResponse.model_rebuild()
