"""
models.py
─────────
SQLAlchemy ORM table definitions.
Only JD is persisted.  All resume / candidate data is processed in-memory
by the pipeline and never written to the DB.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ─────────────────────────────────────────────────────────────
# 1. USER  (populated via Google OAuth)
# ─────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    google_id     = Column(String(128), unique=True, nullable=False)
    email         = Column(String(256), unique=True, nullable=False)
    name          = Column(String(256))
    avatar_url    = Column(Text)
    access_token  = Column(Text)   # Google OAuth token — used to call Drive API
    refresh_token = Column(Text)
    created_at    = Column(DateTime(timezone=True), server_default=func.now())

    job_descriptions = relationship("JobDescription", back_populates="uploaded_by_user")


# ─────────────────────────────────────────────────────────────
# 2. JOB DESCRIPTION  (rich AI-parsed data stored here)
# ─────────────────────────────────────────────────────────────
class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id            = Column(Integer, primary_key=True, index=True)
    title         = Column(String(256), nullable=False)
    company       = Column(String(256))
    jd_text       = Column(Text, nullable=False)          # raw input text / extracted file text

    # ── AI-extracted structured fields ───────────────────────
    required_skills      = Column(JSON, default=list)     # ["Python", "FastAPI", ...]
    nice_to_have_skills  = Column(JSON, default=list)     # ["Docker", "Redis", ...]
    experience_min       = Column(Float, default=0)
    experience_max       = Column(Float, default=99)
    education_required   = Column(String(512))            # "Bachelor's in CS or equivalent"
    employment_type      = Column(String(64))             # "Full-time" | "Contract" | ...
    location             = Column(String(256))            # "Remote" | "Hybrid – NYC" | ...
    responsibilities     = Column(JSON, default=list)     # ["Design APIs", ...]
    benefits             = Column(JSON, default=list)     # ["Health insurance", ...]
    salary_range         = Column(String(128))            # "$120k – $150k" or null
    jd_summary           = Column(Text)                   # 2-sentence AI summary

    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    uploaded_by_user = relationship("User", back_populates="job_descriptions")


# ─────────────────────────────────────────────────────────────
# 3. SKILL CATEGORY  (taxonomy helper — optional)
# ─────────────────────────────────────────────────────────────
class SkillCategory(Base):
    __tablename__ = "skill_categories"

    id       = Column(Integer, primary_key=True, index=True)
    category = Column(String(128), nullable=False)
    skills   = Column(JSON, default=list)
    roles    = Column(JSON, default=list)
