"""
routers/email.py
─────────────────
POST /email/send-report

Sends a candidate resume report email via the logged-in user's Gmail account.
Uses the stored Google access_token (requires gmail.send OAuth scope).
"""

import base64
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google.oauth2.credentials import Credentials

from models import User
from routers.auth import get_current_user

router = APIRouter(prefix="/email", tags=["Email"])


# ── Request / Response schemas ────────────────────────────────
class SendReportRequest(BaseModel):
    to_email:                str
    candidate_name:          str
    jd_title:                str
    match_score:             float
    matched_skills:          List[str]
    missing_skills:          List[str]
    improvement_suggestions: List[str]
    interview_date:          str            # ISO date "YYYY-MM-DD"
    custom_message:          Optional[str] = None


class SendReportResponse(BaseModel):
    message:    str
    message_id: str


# ── HTML email builder ────────────────────────────────────────
def _build_html(req: SendReportRequest, sender_name: str) -> str:
    score = int(req.match_score)
    score_color = (
        "#16a34a" if score >= 80 else
        "#d97706" if score >= 60 else
        "#dc2626"
    )

    matched_html = "".join(
        f'<span style="display:inline-block;font-size:12px;font-weight:500;'
        f'padding:3px 10px;border-radius:20px;margin:3px;'
        f'background:#dcfce7;color:#15803d;border:1px solid #bbf7d0;">{s}</span>'
        for s in req.matched_skills
    ) or '<span style="color:#94a3b8;font-size:13px;">None identified</span>'

    missing_html = "".join(
        f'<span style="display:inline-block;font-size:12px;font-weight:500;'
        f'padding:3px 10px;border-radius:20px;margin:3px;'
        f'background:#fee2e2;color:#b91c1c;border:1px solid #fecaca;">{s}</span>'
        for s in req.missing_skills
    ) or '<span style="color:#94a3b8;font-size:13px;">No gaps identified</span>'

    suggestions_html = "".join(
        f'<li style="font-size:13px;color:#475569;line-height:1.7;margin-bottom:6px;">{s}</li>'
        for s in req.improvement_suggestions
    )

    try:
        dt = datetime.strptime(req.interview_date, "%Y-%m-%d")
        formatted_date = dt.strftime("%A, %d %B %Y")
    except Exception:
        formatted_date = req.interview_date

    custom_block = (
        f'<p style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:20px;">'
        f'{req.custom_message}</p>'
        if req.custom_message else ""
    )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;background:#f1f5f9;">
<div style="max-width:600px;margin:0 auto;background:white;">

  <!-- Header -->
  <div style="background:#0f172a;padding:28px 32px;">
    <h1 style="color:white;margin:0;font-size:20px;font-weight:700;">Resume Match Report</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">{req.jd_title}</p>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px;">
    <p style="font-size:15px;color:#334155;margin-bottom:12px;">Hi {req.candidate_name},</p>

    <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;
                padding:14px 16px;background:#f0f9ff;border-left:4px solid #0ea5e9;border-radius:0 8px 8px 0;">
      The sales team has identified you as a potential match for a client opportunity:
      <strong>{req.jd_title}</strong>.
      Please review this report, work on the highlighted areas, and be ready for a mock interview.
    </div>

    {custom_block}

    <!-- Score -->
    <div style="display:inline-flex;align-items:center;gap:12px;background:#f8fafc;
                border:1px solid #e2e8f0;border-radius:12px;padding:14px 20px;margin-bottom:24px;">
      <div style="font-size:36px;font-weight:900;color:{score_color};line-height:1;">{score}</div>
      <div>
        <div style="font-size:15px;font-weight:600;color:#1e293b;">Match Score</div>
        <div style="font-size:12px;color:#64748b;">out of 100</div>
      </div>
    </div>

    <!-- Matched Skills -->
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;
                  letter-spacing:0.05em;margin-bottom:10px;">
        ✅ Your Matched Skills ({len(req.matched_skills)})
      </div>
      <div>{matched_html}</div>
    </div>

    <!-- Missing Skills -->
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;
                  letter-spacing:0.05em;margin-bottom:10px;">
        ⚠️ Skills to Prepare ({len(req.missing_skills)})
      </div>
      <div>{missing_html}</div>
    </div>

    <!-- Improvement suggestions -->
    <div style="margin-bottom:24px;">
      <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;
                  letter-spacing:0.05em;margin-bottom:10px;">
        📋 Resume Improvement Actions
      </div>
      <ol style="margin:0;padding-left:20px;">{suggestions_html}</ol>
    </div>

    <!-- Interview date -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;
                padding:16px 20px;margin-bottom:24px;">
      <h3 style="margin:0 0 6px;font-size:14px;color:#92400e;">📅 Mock Interview Scheduled</h3>
      <p style="margin:0;font-size:16px;font-weight:700;color:#78350f;">{formatted_date}</p>
    </div>

    <p style="font-size:13px;color:#64748b;">
      Please come prepared. Review the skills listed above and update your resume accordingly.
      Reach out to {sender_name} if you have any questions.
    </p>
  </div>

  <!-- Footer -->
  <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;
              font-size:12px;color:#94a3b8;">
    This is an internal communication sent by {sender_name} via Skillify.
    Please do not reply to this automated email.
  </div>
</div>
</body>
</html>"""


# ── Endpoint ──────────────────────────────────────────────────
@router.post("/send-report", response_model=SendReportResponse)
def send_report_email(
    req:          SendReportRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Send a candidate resume report email from the logged-in user's Gmail.
    Requires the gmail.send OAuth scope (user must have re-authenticated
    after this scope was added).
    """
    if not current_user.access_token:
        raise HTTPException(
            status_code=403,
            detail="No Google access token found. Please sign out and sign in again.",
        )

    try:
        creds   = Credentials(token=current_user.access_token)
        service = build("gmail", "v1", credentials=creds)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialise Gmail client: {e}")

    sender_name = current_user.name or current_user.email

    # Build MIME email
    msg             = MIMEMultipart("alternative")
    msg["Subject"]  = f"[Action Required] Resume Match Report – {req.jd_title}"
    msg["From"]     = f"{sender_name} <{current_user.email}>"
    msg["To"]       = req.to_email

    msg.attach(MIMEText(_build_html(req, sender_name), "html"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("utf-8")

    try:
        result = service.users().messages().send(
            userId="me",
            body={"raw": raw},
        ).execute()

        return SendReportResponse(
            message=f"Email sent successfully to {req.to_email}",
            message_id=result.get("id", ""),
        )

    except HttpError as e:
        if e.resp.status == 403:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Gmail permission denied. Please sign out and sign in again "
                    "to grant email sending permission."
                ),
            )
        raise HTTPException(status_code=502, detail=f"Gmail API error: {e}")

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")
