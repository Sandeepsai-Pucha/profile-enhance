"""
routers/matching.py
────────────────────
The heart of Skillify – the AI Matching Engine.

  POST /matching/run        – run matching for a JD, get top-N results
  GET  /matching/results/{job_id} – fetch previously computed results
  POST /matching/interview/{match_id} – regenerate interview questions
  GET  /matching/summary/{job_id}     – AI executive summary
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, joinedload
from typing import List

from database import get_db
from models import CandidateProfile, JobDescription, MatchResult, User
from schemas import MatchRequest, MatchResponse, MatchResultOut, JDOut
from routers.auth import get_current_user
from services.ai_service import match_candidate, generate_interview_questions, rank_candidates_summary

router = APIRouter(prefix="/matching", tags=["AI Matching Engine"])


# ─────────────────────────────────────────────────────────────
# HELPER: compute match for one candidate and persist to DB
# ─────────────────────────────────────────────────────────────
def _run_single_match(
    db: Session,
    jd: JobDescription,
    candidate: CandidateProfile,
) -> MatchResult:
    """
    Call AI service to match one candidate against the JD,
    generate interview questions, and persist the MatchResult row.
    Idempotent: if a result already exists for this (job, candidate)
    pair it is overwritten.
    """
    # 1. Score the candidate
    ai_data = match_candidate(
        jd_text             = jd.jd_text,
        required_skills     = jd.required_skills or [],
        candidate_resume    = candidate.resume_text or "",
        candidate_skills    = candidate.skills or [],
        candidate_experience= candidate.experience_years or 0,
    )

    # 2. Generate interview questions based on match gaps
    questions = generate_interview_questions(
        job_title      = jd.title,
        required_skills= jd.required_skills or [],
        missing_skills = ai_data.get("missing_skills", []),
        matched_skills = ai_data.get("matched_skills", []),
    )

    # 3. Upsert MatchResult in DB
    existing = db.query(MatchResult).filter(
        MatchResult.job_id       == jd.id,
        MatchResult.candidate_id == candidate.id,
    ).first()

    if existing:
        existing.match_score         = ai_data.get("match_score", 0)
        existing.matched_skills      = ai_data.get("matched_skills", [])
        existing.missing_skills      = ai_data.get("missing_skills", [])
        existing.ai_summary          = ai_data.get("ai_summary", "")
        existing.interview_questions = questions
        db.commit()
        db.refresh(existing)
        return existing
    else:
        result = MatchResult(
            job_id              = jd.id,
            candidate_id        = candidate.id,
            match_score         = ai_data.get("match_score", 0),
            matched_skills      = ai_data.get("matched_skills", []),
            missing_skills      = ai_data.get("missing_skills", []),
            ai_summary          = ai_data.get("ai_summary", ""),
            interview_questions = questions,
        )
        db.add(result)
        db.commit()
        db.refresh(result)
        return result


# ─────────────────────────────────────────────────────────────
# POST: run the matching engine
# ─────────────────────────────────────────────────────────────
@router.post("/run", response_model=MatchResponse)
def run_matching(
    payload: MatchRequest,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """
    Main matching endpoint.
    Steps:
      1. Load the JD from DB
      2. Load all active candidates
      3. Score each candidate via Claude
      4. Sort by match_score DESC
      5. Return top-N with interview questions

    ⚠️  Synchronous: for large candidate pools consider a
        background task queue (Celery / ARQ).
    """
    # Fetch the JD
    jd = db.query(JobDescription).filter(JobDescription.id == payload.job_id).first()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")

    # Load all active candidates
    candidates = db.query(CandidateProfile).filter(
        CandidateProfile.is_active == True
    ).all()

    if not candidates:
        raise HTTPException(status_code=404, detail="No candidate profiles found. Add candidates first.")

    # Run matching for every candidate
    results: List[MatchResult] = []
    for candidate in candidates:
        try:
            result = _run_single_match(db, jd, candidate)
            results.append(result)
        except Exception as e:
            # Log and skip; don't abort the whole batch on one failure
            print(f"[Matching] Failed for candidate {candidate.id}: {e}")
            continue

    # Sort by score descending and take top-N
    results.sort(key=lambda r: r.match_score, reverse=True)
    top_results = results[: payload.top_n]

    # Eager-load candidate data onto each result for serialization
    for r in top_results:
        db.refresh(r)
        # ensure relationship is loaded
        _ = r.candidate

    return MatchResponse(
        job                        = jd,
        results                    = top_results,
        total_candidates_evaluated = len(candidates),
    )


# ─────────────────────────────────────────────────────────────
# GET: previously computed results for a JD
# ─────────────────────────────────────────────────────────────
@router.get("/results/{job_id}", response_model=List[MatchResultOut])
def get_results(
    job_id: int,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """
    Return all saved MatchResult rows for a given JD,
    sorted best-first. No AI call – reads from DB cache.
    """
    results = (
        db.query(MatchResult)
        .options(joinedload(MatchResult.candidate))
        .filter(MatchResult.job_id == job_id)
        .order_by(MatchResult.match_score.desc())
        .all()
    )
    return results


# ─────────────────────────────────────────────────────────────
# POST: regenerate interview questions for a specific match
# ─────────────────────────────────────────────────────────────
@router.post("/interview/{match_id}", response_model=MatchResultOut)
def regenerate_interview_questions(
    match_id: int,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """
    Re-run only the interview question generation step
    (useful when the user wants a fresh set of questions).
    """
    match = db.query(MatchResult).options(
        joinedload(MatchResult.candidate),
        joinedload(MatchResult.job),
    ).filter(MatchResult.id == match_id).first()

    if not match:
        raise HTTPException(status_code=404, detail="Match result not found")

    # Regenerate questions
    questions = generate_interview_questions(
        job_title      = match.job.title,
        required_skills= match.job.required_skills or [],
        missing_skills = match.missing_skills or [],
        matched_skills = match.matched_skills or [],
    )

    match.interview_questions = questions
    db.commit()
    db.refresh(match)
    return match


# ─────────────────────────────────────────────────────────────
# GET: AI executive summary for a JD's results
# ─────────────────────────────────────────────────────────────
@router.get("/summary/{job_id}")
def get_executive_summary(
    job_id: int,
    db: Session = Depends(get_db),
    _: User     = Depends(get_current_user),
):
    """
    Ask Claude to write an executive summary comparing the top
    candidates for a JD. Reads existing MatchResults from DB.
    """
    jd = db.query(JobDescription).filter(JobDescription.id == job_id).first()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")

    results = (
        db.query(MatchResult)
        .options(joinedload(MatchResult.candidate))
        .filter(MatchResult.job_id == job_id)
        .order_by(MatchResult.match_score.desc())
        .limit(5)
        .all()
    )

    if not results:
        raise HTTPException(status_code=404, detail="No match results found. Run matching first.")

    # Build summary payload for Claude
    candidates_summary = [
        {
            "name":           r.candidate.name,
            "score":          r.match_score,
            "matched_skills": r.matched_skills or [],
            "missing_skills": r.missing_skills or [],
        }
        for r in results
    ]

    summary = rank_candidates_summary(jd.title, candidates_summary)
    return {"job_title": jd.title, "summary": summary}
