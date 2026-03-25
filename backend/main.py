"""
main.py
────────
FastAPI application entry point.

Run with:
  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
import os

from database import engine, Base, get_db
from routers import auth
from routers import jobs
from routers import pipeline
from routers.auth import get_current_user

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── FastAPI app ───────────────────────────────────────────────
app = FastAPI(
    title       = "Skillify API",
    description = "AI-Based JD Parsing & Resume Matching Pipeline",
    version     = "2.0.0",
    docs_url    = "/docs",
    redoc_url   = "/redoc",
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ───────────────────────────────────────────────────
app.include_router(auth.router)       # /auth/*
app.include_router(jobs.router)       # /jobs/*
app.include_router(pipeline.router)   # /pipeline/*


# ─────────────────────────────────────────────────────────────
# STARTUP: create tables + migrate new JD columns
# ─────────────────────────────────────────────────────────────
def _migrate_jd_columns():
    """
    Add new columns to job_descriptions if they don't exist yet.
    Safe to run on every startup (idempotent).
    Works for both SQLite (dev) and PostgreSQL (prod).
    """
    new_columns = [
        ("nice_to_have_skills", "TEXT"),
        ("education_required",  "VARCHAR(512)"),
        ("employment_type",     "VARCHAR(64)"),
        ("location",            "VARCHAR(256)"),
        ("responsibilities",    "TEXT"),
        ("benefits",            "TEXT"),
        ("salary_range",        "VARCHAR(128)"),
        ("jd_summary",          "TEXT"),
    ]
    inspector     = inspect(engine)
    existing_cols = {c["name"] for c in inspector.get_columns("job_descriptions")}

    with engine.connect() as conn:
        for col_name, col_type in new_columns:
            if col_name not in existing_cols:
                conn.execute(text(
                    f"ALTER TABLE job_descriptions ADD COLUMN {col_name} {col_type}"
                ))
                conn.commit()
                print(f"  ✅ Added column: job_descriptions.{col_name}")


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")
    try:
        _migrate_jd_columns()
    except Exception as e:
        print(f"⚠️  Column migration warning (safe to ignore if tables are fresh): {e}")


# ── Health check ──────────────────────────────────────────────
@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "app": "Skillify API v2.0"}


# ── Home (protected) ─────────────────────────────────────────
@app.get("/home", tags=["Home"])
def home(
    current_user = Depends(get_current_user),
    db: Session  = Depends(get_db),
):
    """
    Protected home endpoint.
    Returns logged-in user info + 5 most recent JDs.
    """
    from models import JobDescription
    recent_jds = (
        db.query(JobDescription)
        .filter(JobDescription.uploaded_by == current_user.id)
        .order_by(JobDescription.created_at.desc())
        .limit(5)
        .all()
    )
    return {
        "user": {
            "id":         current_user.id,
            "name":       current_user.name,
            "email":      current_user.email,
            "avatar_url": current_user.avatar_url,
        },
        "recent_jds": [
            {
                "id":              jd.id,
                "title":           jd.title,
                "company":         jd.company,
                "required_skills": jd.required_skills or [],
                "experience_min":  jd.experience_min,
                "experience_max":  jd.experience_max,
                "created_at":      jd.created_at.isoformat(),
            }
            for jd in recent_jds
        ],
    }


# ── Run directly ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["."],
        reload_delay=0.1,
    )
