"""
schemas.py
──────────
Pydantic models for request validation and response serialisation.

Ephemeral models (ParsedResume, CandidateMatchResult, PipelineResponse)
are NEVER written to the DB — they live only during a pipeline run.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any, Dict
from datetime import datetime


# ═══════════════════════════════════════════════════════════════
#  AUTH
# ═══════════════════════════════════════════════════════════════

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: Optional[str]
    avatar_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
#  JOB DESCRIPTION  (persisted)
# ═══════════════════════════════════════════════════════════════

class JDCreate(BaseModel):
    title: str
    company: Optional[str] = None
    jd_text: str


class JDOut(BaseModel):
    id: int
    title: str
    company: Optional[str]
    jd_text: str
    # AI-extracted fields
    required_skills:     List[str]
    nice_to_have_skills: List[str]
    experience_min:      float
    experience_max:      float
    education_required:  Optional[str]
    employment_type:     Optional[str]
    location:            Optional[str]
    responsibilities:    List[str]
    benefits:            List[str]
    salary_range:        Optional[str]
    jd_summary:          Optional[str]
    uploaded_by:         Optional[int]
    created_at:          datetime

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════════
#  PIPELINE  (all ephemeral — never stored in DB)
# ═══════════════════════════════════════════════════════════════

class WorkHistoryItem(BaseModel):
    title:            Optional[str]
    company:          Optional[str]
    duration:         Optional[str]
    responsibilities: List[str] = []


class ParsedResume(BaseModel):
    """Structured data extracted from one resume file."""
    name:              str
    email:             Optional[str]
    phone:             Optional[str]
    current_role:      Optional[str]
    experience_years:  float
    skills:            List[str]
    education:         Optional[str]
    certifications:    List[str]
    work_history:      List[WorkHistoryItem]
    summary:           Optional[str]


class InterviewQuestion(BaseModel):
    question:   str
    category:   str   # "Technical" | "Gap" | "Behavioural" | "Situational"
    difficulty: str   # "Easy" | "Medium" | "Hard"


class CandidateMatchResult(BaseModel):
    """Full analysis for one candidate — returned in pipeline response."""
    # Drive / file info
    file_name:      str
    drive_file_id:  str
    drive_file_url: str

    # Parsed resume
    parsed_resume: ParsedResume

    # Match analysis
    match_score:       float          # 0-100
    matched_skills:    List[str]
    missing_skills:    List[str]
    extra_skills:      List[str]      # candidate has these, JD didn't ask for them
    experience_match:  str            # "Under-qualified" | "Good fit" | "Over-qualified"
    ai_summary:        str

    # Actionable outputs
    improvement_suggestions: List[str]
    interview_questions:     List[InterviewQuestion]


class PipelineRequest(BaseModel):
    jd_id:           int
    drive_folder_id: Optional[str] = None
    top_n:           int   = Field(5,    ge=1, le=20)
    min_score:       float = Field(40.0, ge=0, le=100)


class PipelineStats(BaseModel):
    total_files_found:     int
    total_parsed:          int
    total_above_threshold: int
    processing_time_secs:  float


class PipelineResponse(BaseModel):
    jd:                JDOut
    top_candidates:    List[CandidateMatchResult]
    executive_summary: str
    stats:             PipelineStats
    errors:            List[str]   # per-file errors (non-fatal)


# ═══════════════════════════════════════════════════════════════
#  SKILL CATEGORY
# ═══════════════════════════════════════════════════════════════

class SkillCategoryOut(BaseModel):
    id: int
    category: str
    skills: List[str]
    roles: List[str]

    model_config = {"from_attributes": True}
