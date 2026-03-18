"""
database.py
───────────
Sets up the SQLAlchemy engine and session factory.

For local development / testing (no PostgreSQL needed):
  Set USE_SQLITE=true in .env  →  uses a local SQLite file (skillify_dev.db)

For production:
  Set DATABASE_URL=postgresql://...  →  connects to PostgreSQL
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"

if USE_SQLITE:
    # SQLite – zero setup, file stored next to this module
    DATABASE_URL = "sqlite:///./skillify_dev.db"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # needed for SQLite + FastAPI
        echo=False,
    )
else:
    # PostgreSQL – used in staging / production
    DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/skillify_db")
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        echo=False,
    )

# ── Session factory: each request gets its own session ────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# ── Base class all ORM models inherit from ───────────────────
Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a DB session per request.
    Guarantees the session is closed even if an exception occurs.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
