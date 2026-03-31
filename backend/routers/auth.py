"""
routers/auth.py
───────────────
Google OAuth 2.0 flow:
  GET  /auth/google/login    → redirect user to Google's consent screen
  GET  /auth/google/callback → Google redirects here with ?code=
  POST /auth/verify-token    → frontend sends Google JWT; we return our own JWT
  GET  /auth/me              → return current logged-in user
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import JWTError, jwt
import httpx

from database import get_db
from models import User
from schemas import TokenResponse, UserOut

# Load .env before reading any env vars — routers are imported
# before main.py's load_dotenv() runs, so we need it here too.
load_dotenv()

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ── Config from .env ─────────────────────────────────────────
GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI  = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
FRONTEND_URL         = os.getenv("FRONTEND_URL", "http://localhost:5173")
SECRET_KEY           = os.getenv("SECRET_KEY", "changeme")
ALGORITHM            = os.getenv("ALGORITHM", "HS256")
TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

GOOGLE_TOKEN_URL   = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


# ─────────────────────────────────────────────────────────────
# HELPER: create our own JWT for the frontend
# ─────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_minutes: Optional[int] = None) -> str:
    """
    Sign a JWT that includes the user's DB id as 'sub'.
    Frontend stores this and sends it as Bearer token on every request.
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes or TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    FastAPI dependency: decode Bearer JWT and return the User row.
    Used as Depends(get_current_user) in protected routes.
    """
    credentials_exception = HTTPException(status_code=401, detail="Not authenticated")

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise credentials_exception

    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise credentials_exception
    return user


# ─────────────────────────────────────────────────────────────
# STEP 1: redirect user to Google's OAuth consent screen
# ─────────────────────────────────────────────────────────────
@router.get("/google/login")
def google_login():
    """
    Build the Google OAuth URL with required scopes and
    redirect the browser there.
    """
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_CLIENT_ID is not configured. Check backend/.env"
        )

    scopes = "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.send"
    scopes = "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/calendar.events"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={GOOGLE_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope={scopes.replace(' ', '%20')}"
        f"&access_type=offline"   # get refresh_token
        f"&prompt=consent"
    )
    return RedirectResponse(url)


# ─────────────────────────────────────────────────────────────
# STEP 2: Google redirects here with ?code=
# ─────────────────────────────────────────────────────────────
@router.get("/google/callback")
async def google_callback(code: str, db: Session = Depends(get_db)):
    """
    Exchange the authorization code for Google tokens,
    fetch user info, upsert user in DB, mint our JWT,
    then redirect the browser to the React frontend with ?token=JWT.
    """
    async with httpx.AsyncClient() as client:
        token_response = await client.post(GOOGLE_TOKEN_URL, data={
            "code":          code,
            "client_id":     GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri":  GOOGLE_REDIRECT_URI,
            "grant_type":    "authorization_code",
        })
        token_data = token_response.json()

        if "error" in token_data:
            raise HTTPException(status_code=400, detail=f"Google token error: {token_data['error']}")

        access_token  = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")

        user_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        user_info = user_response.json()

    # Upsert user in database
    user = db.query(User).filter(User.google_id == user_info.get("sub")).first()
    if user:
        user.access_token  = access_token
        user.refresh_token = refresh_token or user.refresh_token
        user.avatar_url    = user_info.get("picture")
    else:
        user = User(
            google_id     = user_info.get("sub"),
            email         = user_info.get("email"),
            name          = user_info.get("name"),
            avatar_url    = user_info.get("picture"),
            access_token  = access_token,
            refresh_token = refresh_token,
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    jwt_token = create_access_token({"sub": str(user.id)})
    # Redirect the browser back to the React frontend with the JWT in the URL.
    # The frontend AuthCallbackPage reads ?token= and stores it.
    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={jwt_token}")


# ─────────────────────────────────────────────────────────────
# GET CURRENT USER  (used on app load to restore session)
# ─────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the logged-in user's profile."""
    return current_user
