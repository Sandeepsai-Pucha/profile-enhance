"""
database.py
───────────
Sets up the SQLAlchemy engine and session factory.

For local development / testing (no PostgreSQL needed):
  Set USE_SQLITE=true in .env  →  uses a local SQLite file (skillify_dev.db)

For production:
  Set DATABASE_URL=postgresql://...  →  connects to PostgreSQL
"""

from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

load_dotenv()

USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true"

try:
    if USE_SQLITE:
        DATABASE_URL = "sqlite:///./skillify_dev.db"
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False,
        )
    else:
        DATABASE_URL = os.getenv(
            "DATABASE_URL",
            "postgresql://postgres:sandeep1234@localhost:5432/skillify_db"
        )
        engine = create_engine(
            DATABASE_URL,
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
            echo=False,
        )

    # ✅ TEST CONNECTION
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        print("[DB] Connected successfully")

except Exception as e:
    print("[DB] Connection FAILED")
    print("Error:", str(e))


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()