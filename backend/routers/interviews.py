"""
routers/interviews.py
──────────────────────
GET  /interviews/interviewers  — return hardcoded interviewer list
POST /interviews/schedule      — create a Google Calendar event for an interview

Interviewers are hardcoded (no DB required):
  - Adarsh AP:  09:00–12:00
  - Vedavyas:   13:00–17:00
"""

import httpx
from fastapi import APIRouter, Depends, HTTPException
from models import User
from routers.auth import get_current_user
from schemas import ScheduleInterviewRequest, ScheduleInterviewResponse

router = APIRouter(prefix="/interviews", tags=["Interview Scheduling"])

INTERVIEWERS = [
    {
        "name":           "Adarsh AP",
        "email":          "adarsh.puthiyapurayil@absyz.com",
        "available_from": "09:00",
        "available_to":   "12:00",
    },
    {
        "name":           "Vedavyas",
        "email":          "vedavyas.govardhanam@absyz.com",
        "available_from": "13:00",
        "available_to":   "17:00",
    },
]

GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events"


@router.get("/interviewers")
def get_interviewers(current_user: User = Depends(get_current_user)):
    """Return the hardcoded interviewer list with availability windows."""
    return INTERVIEWERS


@router.post("/schedule", response_model=ScheduleInterviewResponse)
async def schedule_interview(
    payload: ScheduleInterviewRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Create a Google Calendar event for an interview.
    Uses the logged-in user's Google OAuth access_token.
    The user must have re-authenticated after the calendar.events scope was added.
    """
    if not current_user.access_token:
        raise HTTPException(
            status_code=403,
            detail="No Google access token. Please sign out and sign in again.",
        )

    # Validate interviewer email
    known_emails = {i["email"] for i in INTERVIEWERS}
    if payload.interviewer_email not in known_emails:
        raise HTTPException(status_code=400, detail="Unknown interviewer email.")

    attendees = [{"email": payload.interviewer_email}]
    if payload.candidate_email:
        attendees.append({"email": payload.candidate_email})

    event_body = {
        "summary": f"Interview – {payload.candidate_name} for {payload.jd_title}",
        "description": (
            f"Resume: {payload.resume_url}\n\n"
            f"AI Summary:\n{payload.ai_summary}"
        ),
        "start": {
            "dateTime": payload.start_datetime,
            "timeZone": payload.timezone,
        },
        "end": {
            "dateTime": payload.end_datetime,
            "timeZone": payload.timezone,
        },
        "attendees": attendees,
        "reminders": {
            "useDefault": False,
            "overrides": [
                {"method": "email",  "minutes": 60},
                {"method": "popup",  "minutes": 15},
            ],
        },
        "conferenceData": {
            "createRequest": {
                "requestId": f"skillify-{payload.candidate_name}-{payload.start_datetime}",
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            GOOGLE_CALENDAR_API,
            json=event_body,
            headers={"Authorization": f"Bearer {current_user.access_token}"},
            params={"conferenceDataVersion": "1"},
        )

    if resp.status_code == 401:
        raise HTTPException(
            status_code=403,
            detail=(
                "Google Calendar authorization failed. "
                "Please sign out and sign in again to grant Calendar permissions."
            ),
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Google Calendar API error {resp.status_code}: {resp.text[:300]}",
        )

    data = resp.json()
    return ScheduleInterviewResponse(
        event_id=data.get("id", ""),
        event_link=data.get("htmlLink", ""),
        message=(
            f"Interview scheduled for {payload.candidate_name}. "
            "A calendar invite has been sent to all attendees."
        ),
    )
