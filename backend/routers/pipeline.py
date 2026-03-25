"""
routers/pipeline.py
────────────────────
POST /pipeline/run

Runs the full 9-step pipeline entirely in memory:
  1. Load JD from DB
  2. Fetch resumes from Google Drive
  3. Parse each resume with AI
  4. Match each resume against the JD
  5. Filter by min_score threshold
  6. Generate improvement suggestions for top candidates
  7. Generate interview questions for top candidates
  8. Rank + produce executive summary
  9. Return full PipelineResponse (nothing written to DB)

No candidate data is persisted — results are ephemeral.
"""

import time
import concurrent.futures
from typing import List, Dict, Any, Tuple, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import JobDescription, User
from schemas import (
    PipelineRequest, PipelineResponse,
    CandidateMatchResult, ParsedResume,
    WorkHistoryItem, InterviewQuestion,
    PipelineStats, JDOut,
)
from routers.auth import get_current_user
from services.ai_service import (
    parse_resume,
    match_resume_to_jd,
    generate_improvement_suggestions,
    generate_interview_questions,
    generate_executive_summary,
)
from services.google_drive_service import fetch_all_resumes

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])


# ─────────────────────────────────────────────────────────────
# HELPER: process one resume file through the full pipeline
# ─────────────────────────────────────────────────────────────
def _process_one_resume(
    file_meta:   Dict[str, Any],
    jd_data:     Dict[str, Any],
    jd_obj:      JobDescription,
    jd_raw_text: str = "",
) -> Tuple[Optional[CandidateMatchResult], Optional[str]]:
    """
    Parse + match one resume.
    Returns (result, None) on success, (None, error_msg) on failure.
    """
    try:
        resume_text = file_meta["text"]

        # Step 3 – Parse resume
        parsed = parse_resume(resume_text)

        # Step 4 – Match against JD (pass raw JD text as fallback context)
        match = match_resume_to_jd(jd_data, parsed, resume_text, jd_raw_text)

        # Build WorkHistory items
        work_history = [
            WorkHistoryItem(
                title=wh.get("title"),
                company=wh.get("company"),
                duration=wh.get("duration"),
                responsibilities=wh.get("responsibilities", []),
            )
            for wh in (parsed.get("work_history") or [])
        ]

        resume_model = ParsedResume(
            name=parsed.get("name", "Unknown"),
            email=parsed.get("email"),
            phone=parsed.get("phone"),
            current_role=parsed.get("current_role"),
            experience_years=float(parsed.get("experience_years") or 0),
            skills=parsed.get("skills", []),
            education=parsed.get("education"),
            certifications=parsed.get("certifications", []),
            work_history=work_history,
            summary=parsed.get("summary"),
        )

        result = CandidateMatchResult(
            file_name=file_meta["name"],
            drive_file_id=file_meta["id"],
            drive_file_url=file_meta.get("webViewLink", ""),
            parsed_resume=resume_model,
            match_score=match["match_score"],
            matched_skills=match["matched_skills"],
            missing_skills=match["missing_skills"],
            extra_skills=match["extra_skills"],
            experience_match=match["experience_match"],
            ai_summary=match["ai_summary"],
            improvement_suggestions=[],   # filled later for top-N only
            interview_questions=[],        # filled later for top-N only
        )
        return result, None

    except Exception as e:
        return None, f"{file_meta.get('name', 'Unknown')}: {e}"


# ─────────────────────────────────────────────────────────────
# POST /pipeline/run
# ─────────────────────────────────────────────────────────────
@router.post("/run", response_model=PipelineResponse)
def run_pipeline(
    payload:      PipelineRequest,
    db:           Session     = Depends(get_db),
    current_user: User        = Depends(get_current_user),
):
    """
    Execute the full resume-matching pipeline for a given JD.

    • Fetches resumes from the logged-in user's Google Drive
    • Parses and matches each resume against the JD
    • Returns ranked top-N candidates with improvement tips and interview questions
    • Nothing is written to the database
    """
    start_time = time.time()
    errors: List[str] = []

    # ── Step 1: Load JD ──────────────────────────────────────
    jd_obj = db.query(JobDescription).filter(
        JobDescription.id == payload.jd_id,
        JobDescription.uploaded_by == current_user.id,
    ).first()

    if not jd_obj:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Build JD data dict for AI functions
    jd_raw_text = jd_obj.jd_text or ""
    jd_data = {
        "title":             jd_obj.title,
        "jd_summary":        jd_obj.jd_summary or jd_obj.title,
        "required_skills":   jd_obj.required_skills or [],
        "nice_to_have_skills": jd_obj.nice_to_have_skills or [],
        "experience_min":    jd_obj.experience_min,
        "experience_max":    jd_obj.experience_max,
        "education_required": jd_obj.education_required,
        "responsibilities":  jd_obj.responsibilities or [],
    }

    # Warn if JD has no extracted skills (AI parsing may have failed)
    if not jd_data["required_skills"]:
        print(f"[Pipeline] WARNING: JD '{jd_obj.title}' has no required_skills. "
              "Raw text will be used as fallback context for matching.")

    # ── Step 2: Fetch resumes from Drive ─────────────────────
    if not current_user.access_token:
        raise HTTPException(
            status_code=403,
            detail="No Google Drive access token. Please sign out and sign in again.",
        )

    resumes, fetch_errors = fetch_all_resumes(
        current_user.access_token,
        payload.drive_folder_id,
    )
    errors.extend(fetch_errors)

    if not resumes:
        raise HTTPException(
            status_code=404,
            detail="No resume files found in Google Drive. "
                   "Upload PDF/DOCX/TXT resumes and try again, "
                   "or specify a drive_folder_id.",
        )

    # ── Steps 3+4: Parse + match all resumes (parallel) ──────
    all_results: List[CandidateMatchResult] = []

    # Use ThreadPoolExecutor for I/O-bound AI calls
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {
            executor.submit(_process_one_resume, file_meta, jd_data, jd_obj, jd_raw_text): file_meta
            for file_meta in resumes
        }
        for future in concurrent.futures.as_completed(future_map):
            result, err = future.result()
            if err:
                errors.append(err)
            elif result:
                all_results.append(result)

    # ── Step 5: Filter by min_score ───────────────────────────
    above_threshold = [r for r in all_results if r.match_score >= payload.min_score]

    # Safety fallback: if nothing passes the threshold, return best available
    # candidates (up to top_n) and add an informational error message
    if not above_threshold and all_results:
        ranked_all = sorted(all_results, key=lambda r: r.match_score, reverse=True)
        best_score = ranked_all[0].match_score
        errors.append(
            f"No candidates scored ≥ {payload.min_score:.0f}%. "
            f"Showing best available result(s) instead (top score: {best_score:.0f}%). "
            "Consider lowering the minimum match score slider."
        )
        above_threshold = ranked_all[:payload.top_n]

    # Log scores for debugging
    score_summary = ", ".join(
        f"{r.parsed_resume.name}={r.match_score:.0f}" for r in all_results
    )
    print(f"[Pipeline] Scores: {score_summary or 'none'} | threshold={payload.min_score}")

    # ── Step 6+7+8: Top-N enrichment (sequential to manage API rate) ──
    ranked = sorted(above_threshold, key=lambda r: r.match_score, reverse=True)
    top_n  = ranked[: payload.top_n]

    for candidate in top_n:
        parsed = candidate.parsed_resume

        # Step 6 – Improvement suggestions
        suggestions = generate_improvement_suggestions(
            jd_data=jd_data,
            resume_data={
                "name":         parsed.name,
                "current_role": parsed.current_role,
                "skills":       parsed.skills,
            },
            missing_skills=candidate.missing_skills,
            match_score=candidate.match_score,
        )
        candidate.improvement_suggestions = suggestions

        # Step 7 – Interview questions
        questions = generate_interview_questions(
            job_title=jd_obj.title,
            jd_summary=jd_data["jd_summary"],
            required_skills=jd_data["required_skills"],
            matched_skills=candidate.matched_skills,
            missing_skills=candidate.missing_skills,
            candidate_name=parsed.name,
            candidate_role=parsed.current_role or "Unknown",
        )
        candidate.interview_questions = [
            InterviewQuestion(**q) if isinstance(q, dict) else q
            for q in questions
        ]

    # ── Step 9: Executive summary ─────────────────────────────
    summary_data = [
        {
            "name":         c.parsed_resume.name,
            "current_role": c.parsed_resume.current_role or "Unknown",
            "score":        c.match_score,
            "matched_skills": c.matched_skills,
            "missing_skills": c.missing_skills,
        }
        for c in top_n
    ]
    executive_summary = generate_executive_summary(
        jd_obj.title, jd_data["jd_summary"], summary_data
    )

    elapsed = round(time.time() - start_time, 1)

    return PipelineResponse(
        jd=JDOut.model_validate(jd_obj),
        top_candidates=top_n,
        executive_summary=executive_summary,
        stats=PipelineStats(
            total_files_found=len(resumes),
            total_parsed=len(all_results),
            total_above_threshold=len(above_threshold),
            processing_time_secs=elapsed,
        ),
        errors=errors,
    )
