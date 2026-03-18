"""
models.py
─────────
All SQLAlchemy ORM table definitions.
Each class maps 1-to-1 to a PostgreSQL table.
Run `seed_data.py` to create tables and insert test rows.
"""

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey,
    Float, Boolean, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ─────────────────────────────────────────────────────────────
# 1. USER  (populated via Google OAuth)
# ─────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    google_id     = Column(String(128), unique=True, nullable=False)   # sub from Google JWT
    email         = Column(String(256), unique=True, nullable=False)
    name          = Column(String(256))
    avatar_url    = Column(Text)                                        # Google profile picture
    access_token  = Column(Text)                                        # Google OAuth token (for Drive)
    refresh_token = Column(Text)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    job_descriptions = relationship("JobDescription", back_populates="uploaded_by_user")


# ─────────────────────────────────────────────────────────────
# 2. CANDIDATE PROFILE  (synced from Google Drive)
# ─────────────────────────────────────────────────────────────
class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String(256), nullable=False)
    email            = Column(String(256), unique=True, nullable=False)
    phone            = Column(String(32))
    current_role     = Column(String(256))                              # e.g. "Senior Python Developer"
    experience_years = Column(Float, default=0)                         # total YOE
    skills           = Column(JSON, default=[])                         # ["Python", "FastAPI", ...]
    education        = Column(String(512))                              # "B.Tech CSE – IIT Hyderabad"
    summary          = Column(Text)                                     # short bio
    resume_text      = Column(Text)                                     # full parsed resume text
    drive_file_id    = Column(String(256))                              # Google Drive file ID
    drive_file_url   = Column(Text)                                     # shareable link
    is_active        = Column(Boolean, default=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now())
    updated_at       = Column(DateTime(timezone=True), onupdate=func.now())

    # relationships
    match_results = relationship("MatchResult", back_populates="candidate")


# ─────────────────────────────────────────────────────────────
# 3. JOB DESCRIPTION  (uploaded by the logged-in user / client)
# ─────────────────────────────────────────────────────────────
class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String(256), nullable=False)               # "Backend Engineer – FinTech"
    company         = Column(String(256))
    jd_text         = Column(Text, nullable=False)                      # raw JD content
    required_skills = Column(JSON, default=[])                          # parsed from JD by AI
    experience_min  = Column(Float, default=0)
    experience_max  = Column(Float, default=99)
    uploaded_by     = Column(Integer, ForeignKey("users.id"))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    uploaded_by_user = relationship("User", back_populates="job_descriptions")
    match_results    = relationship("MatchResult", back_populates="job")


# ─────────────────────────────────────────────────────────────
# 4. MATCH RESULT  (output of the AI Matching Engine)
# ─────────────────────────────────────────────────────────────
class MatchResult(Base):
    __tablename__ = "match_results"

    id                  = Column(Integer, primary_key=True, index=True)
    job_id              = Column(Integer, ForeignKey("job_descriptions.id"), nullable=False)
    candidate_id        = Column(Integer, ForeignKey("candidate_profiles.id"), nullable=False)
    match_score         = Column(Float, default=0.0)                    # 0-100 percentage
    matched_skills      = Column(JSON, default=[])                      # skills present in both
    missing_skills      = Column(JSON, default=[])                      # skills in JD but not in candidate
    ai_summary          = Column(Text)                                  # Claude's match explanation
    interview_questions = Column(JSON, default=[])                      # list of {question, category}
    created_at          = Column(DateTime(timezone=True), server_default=func.now())

    # relationships
    job       = relationship("JobDescription", back_populates="match_results")
    candidate = relationship("CandidateProfile", back_populates="match_results")


# ─────────────────────────────────────────────────────────────
# 5. PROFILE LIBRARY  (skill / role taxonomy for mapping)
# ─────────────────────────────────────────────────────────────
class SkillCategory(Base):
    __tablename__ = "skill_categories"

    id           = Column(Integer, primary_key=True, index=True)
    category     = Column(String(128), nullable=False)                  # "Backend", "DevOps", etc.
    skills       = Column(JSON, default=[])                             # canonical skill list
    roles        = Column(JSON, default=[])                             # roles that use this category
