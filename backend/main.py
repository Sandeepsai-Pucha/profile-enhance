"""
main.py
────────
FastAPI application entry point.
Registers all routers, CORS middleware, and creates DB tables on startup.

Run with:
  uvicorn main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

from database import engine, Base
from routers import auth, candidates, jobs, matching

load_dotenv()

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ── Create FastAPI app instance ───────────────────────────────
app = FastAPI(
    title       = "Skillify API",
    description = "AI-Based Profile Matching & Interview Preparation System",
    version     = "1.0.0",
    docs_url    = "/docs",    # Swagger UI
    redoc_url   = "/redoc",   # ReDoc UI
)

# ── CORS: allow the React frontend to call this API ──────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = [FRONTEND_URL, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Register routers with their URL prefixes ─────────────────
app.include_router(auth.router)         # /auth/*
app.include_router(candidates.router)   # /candidates/*
app.include_router(jobs.router)         # /jobs/*
app.include_router(matching.router)     # /matching/*


# ── Startup: create tables if they don't exist ───────────────
@app.on_event("startup")
def on_startup():
    """
    Auto-create all SQLAlchemy models as DB tables.
    In production, use Alembic migrations instead.
    """
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")


# ── Health check ─────────────────────────────────────────────
@app.get("/", tags=["Health"])
def health_check():
    """Simple ping endpoint to verify the API is alive."""
    return {"status": "ok", "app": "Skillify API v1.0"}


# ── Run directly (for debugging without uvicorn CLI) ─────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
