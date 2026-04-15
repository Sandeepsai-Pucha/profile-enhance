"""
routers/interviews.py
──────────────────────
GET  /interviews/interviewers  — return hardcoded interviewer list
POST /interviews/schedule      — create a Google Calendar event for an interview

Interviewers are hardcoded (no DB required):
  - Adarsh AP:  09:00–12:00
  - Vedavyas:   13:00–17:00
"""

import base64
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import httpx
from fastapi import APIRouter, Depends, HTTPException
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
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


def _send_interviewer_email(
    access_token:       str,
    sender_name:        str,
    sender_email:       str,
    interviewer_email:  str,
    interviewer_name:   str,
    candidate_name:     str,
    jd_title:           str,
    start_datetime:     str,
    end_datetime:       str,
    timezone:           str,
    meet_link:          str,
    event_link:         str,
):
    """Send a direct Gmail notification to the interviewer."""
    try:
        creds   = Credentials(token=access_token)
        service = build("gmail", "v1", credentials=creds)

        html = f"""<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f1f5f9;">
<div style="max-width:600px;margin:0 auto;background:white;">
  <div style="background:#0f172a;padding:24px 32px;">
    <h1 style="color:white;margin:0;font-size:18px;font-weight:700;">Interview Scheduled</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">{jd_title}</p>
  </div>
  <div style="padding:28px 32px;space-y:16px;">
    <p style="font-size:15px;color:#334155;">Hi {interviewer_name},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;">
      You have been scheduled to interview <strong>{candidate_name}</strong> for the role of
      <strong>{jd_title}</strong>.
    </p>
    <div style="background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;
                padding:16px 20px;margin:20px 0;">
      <p style="margin:0 0 8px;font-size:13px;color:#0369a1;font-weight:600;">INTERVIEW DETAILS</p>
      <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Candidate:</strong> {candidate_name}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Role:</strong> {jd_title}</p>
      <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>Start:</strong> {start_datetime} ({timezone})</p>
      <p style="margin:0 0 4px;font-size:14px;color:#1e293b;"><strong>End:</strong> {end_datetime} ({timezone})</p>
      {"<p style='margin:0;font-size:14px;'><strong>Meet Link:</strong> <a href='" + meet_link + "' style='color:#0ea5e9;'>" + meet_link + "</a></p>" if meet_link else ""}
    </div>
    {"<p style='margin:0 0 16px;'><a href='" + event_link + "' style='display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;'>Open in Google Calendar</a></p>" if event_link else ""}
    <p style="font-size:13px;color:#64748b;">
      This interview was scheduled by {sender_name} via Skillify.
    </p>
  </div>
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;
              font-size:12px;color:#94a3b8;">
    This is an automated notification from Skillify. Please do not reply to this email.
  </div>
</div>
</body>
</html>"""

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[Interview Scheduled] {candidate_name} – {jd_title}"
        msg["From"]    = f"{sender_name} <{sender_email}>"
        msg["To"]      = interviewer_email
        msg.attach(MIMEText(html, "html"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        print(f"[Interviews] Interviewer email sent to {interviewer_email}")
    except HttpError as e:
        print(f"[Interviews] Gmail send to interviewer failed (HttpError): {e}")
    except Exception as e:
        print(f"[Interviews] Gmail send to interviewer failed: {e}")


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

    # Always include interviewer; add candidate if email is available
    attendees = [
        {"email": payload.interviewer_email, "responseStatus": "needsAction"},
    ]
    if payload.candidate_email:
        attendees.append({"email": payload.candidate_email, "responseStatus": "needsAction"})

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
            params={"conferenceDataVersion": "1", "sendUpdates": "all"},
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

    data       = resp.json()
    event_link = data.get("htmlLink", "")
    meet_link  = (
        data.get("conferenceData", {})
            .get("entryPoints", [{}])[0]
            .get("uri", "")
    )

    # Find interviewer name from hardcoded list
    interviewer_name = next(
        (i["name"] for i in INTERVIEWERS if i["email"] == payload.interviewer_email),
        payload.interviewer_email,
    )

    # Send a direct Gmail to the interviewer (Calendar invite may not email internal users)
    _send_interviewer_email(
        access_token      = current_user.access_token,
        sender_name       = current_user.name or current_user.email,
        sender_email      = current_user.email,
        interviewer_email = payload.interviewer_email,
        interviewer_name  = interviewer_name,
        candidate_name    = payload.candidate_name,
        jd_title          = payload.jd_title,
        start_datetime    = payload.start_datetime,
        end_datetime      = payload.end_datetime,
        timezone          = payload.timezone,
        meet_link         = meet_link,
        event_link        = event_link,
    )

    return ScheduleInterviewResponse(
        event_id=data.get("id", ""),
        event_link=event_link,
        message=(
            f"Interview scheduled for {payload.candidate_name}. "
            f"Calendar invite and email notification sent to {interviewer_name}."
        ),
    )
