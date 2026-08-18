"""
models.py
─────────
SQLAlchemy ORM table definitions.

Persisted:
  - User           (Google OAuth data)
  - JobDescription (AI-parsed JD fields)
  - CandidateProfile (PageIndex tree for vector-less RAG)

All pipeline matching output (CandidateMatchResult etc.) is still ephemeral.
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

    job_descriptions   = relationship("JobDescription", back_populates="uploaded_by_user")
    candidate_profiles = relationship("CandidateProfile", back_populates="user")


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

    # ── Configurable scoring weights (must sum to 100) ───────
    # Used by services/matching_service.py::compute_match(). Defaults mirror
    # that module's built-in weights (skill coverage / experience / nice-to-
    # have / education).
    weight_skills        = Column(Float, default=55.0)
    weight_experience    = Column(Float, default=25.0)
    weight_nice_to_have  = Column(Float, default=15.0)
    weight_education     = Column(Float, default=5.0)

    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at  = Column(DateTime(timezone=True), server_default=func.now())

    uploaded_by_user = relationship("User", back_populates="job_descriptions")





# ─────────────────────────────────────────────────────────────
# 3. CANDIDATE PROFILE  (Indexing Pipeline output — PageIndex tree)
# ─────────────────────────────────────────────────────────────
class CandidateProfile(Base):
    """
    Persisted resume index built by the Indexing Pipeline.
    Stores the hierarchical PageIndex tree as JSON + a flat BM25 corpus string.

    The Matching Pipeline:
      1. Loads all profiles for the user
      2. BM25 pre-filters to top-K candidates
      3. Feeds page_index tree into LLM for deep matching
    """
    __tablename__ = "candidate_profiles"

    id              = Column(Integer, primary_key=True, index=True)
    source_file_id  = Column(String(256), nullable=False, index=True)   # "local-0", drive file id, etc.
    file_name       = Column(String(512), nullable=False)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    # PageIndex tree — full structured resume representation
    page_index      = Column(JSON, nullable=False, default=dict)

    # BM25 corpus — flattened text for BM25 pre-filtering
    bm25_corpus     = Column(Text, nullable=False, default="")

    # Fast-access metadata (extracted from page_index for SQL queries)
    candidate_name  = Column(String(256))
    current_role    = Column(String(256))
    experience_years = Column(Float, default=0.0)
    skills          = Column(JSON, default=list)   # flat skill list for quick display

    # Stream classification: "Digital" | "QA" | "Salesforce" | None
    stream          = Column(String(32), nullable=True, index=True)

    indexed_at      = Column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="candidate_profiles")


# ─────────────────────────────────────────────────────────────
# 4. SKILL CATEGORY  (taxonomy helper — optional)
# ─────────────────────────────────────────────────────────────
class SkillCategory(Base):
    __tablename__ = "skill_categories"

    id       = Column(Integer, primary_key=True, index=True)
    category = Column(String(128), nullable=False)
    skills   = Column(JSON, default=list)
    roles    = Column(JSON, default=list)


# ─────────────────────────────────────────────────────────────
# 5. FAILED PARSE  (resumes that exhausted all retries — not dropped)
# ─────────────────────────────────────────────────────────────
class FailedParse(Base):
    """
    A resume that failed to parse after all retries were exhausted (e.g.
    Groq rate-limit retries, or an unparseable AI response). Kept here
    instead of being silently dropped so it's visible and can be
    reprocessed later (see indexing_service.reprocess_failed_parses()).

    Cleared automatically the next time this source_file_id parses
    successfully (see indexing_service._upsert()).
    """
    __tablename__ = "failed_parses"

    id             = Column(Integer, primary_key=True, index=True)
    source_file_id = Column(String(256), nullable=False, index=True)
    file_name      = Column(String(512), nullable=False)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    stream         = Column(String(32), nullable=True)
    error          = Column(Text, nullable=False)
    attempts       = Column(Integer, default=1)
    failed_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
