"""
routers/pipeline.py
────────────────────
POST /pipeline/run    — Vector-less RAG Matching Pipeline
GET  /pipeline/folders — Search Google Drive folders

Two-pipeline architecture:
  Indexing Pipeline (separate — see routers/indexing.py):
    Drive/local → Parse → PageIndex tree → PostgreSQL

  Matching Pipeline (this file):
    1. Load JD from DB
    2. Load indexed CandidateProfiles from DB
    3. BM25 pre-filter → top-K candidates
    4. LLM deep match on top-K (using stored PageIndex trees)
    5. Filter by min_score threshold
    6. Generate improvement suggestions for top-N
    7. Generate interview questions for top-N
    8. Rank + executive summary
    9. Return PipelineResponse (nothing written to DB)

Falls back to live local-file parsing if no indexed profiles exist yet.
"""

import time
import concurrent.futures
from typing import List, Dict, Any, Tuple, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import JobDescription, User, CandidateProfile
from schemas import (
    PipelineRequest, PipelineResponse,
    CandidateMatchResult, ParsedResume,
    WorkHistoryItem, InterviewQuestion,
    PipelineStats, JDOut,
)
from routers.auth import get_current_user
from services.bm25_service import BM25, build_jd_query
from services.matching_service import compute_match

import os as _os
_AI_PROVIDER = _os.getenv("AI_PROVIDER", "claude").lower()
if _AI_PROVIDER == "claude":
    from services.claude_service import (
        parse_resume,
        match_resume_to_jd,
        generate_improvement_suggestions,
        generate_interview_questions,
        generate_executive_summary,
    )
    generate_candidate_enrichment = None
elif _AI_PROVIDER == "ollama":
    from services.ollama_service import (
        parse_resume,
        match_resume_to_jd,
        generate_improvement_suggestions,
        generate_interview_questions,
        generate_executive_summary,
    )
    generate_candidate_enrichment = None
elif _AI_PROVIDER == "groq":
    from services.groq_service import (
        parse_resume,
        match_resume_to_jd,
        generate_improvement_suggestions,
        generate_interview_questions,
        generate_executive_summary,
        generate_candidate_enrichment,
    )
else:
    from services.ai_service import (
        parse_resume,
        match_resume_to_jd,
        generate_improvement_suggestions,
        generate_interview_questions,
        generate_executive_summary,
        generate_candidate_enrichment,
    )
from services.google_drive_service import fetch_all_resumes, search_folders

router = APIRouter(prefix="/pipeline", tags=["Pipeline"])

# How many candidates BM25 pre-selects before LLM deep-matching
BM25_PREFILTER_K = int(_os.getenv("BM25_PREFILTER_K", "50"))


# ─────────────────────────────────────────────────────────────
# FALLBACK: live local resume loader (used when no profiles indexed)
# ─────────────────────────────────────────────────────────────
def _load_local_resumes(file_path: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parse a local text file containing multiple resumes separated by ===RESUME N===.
    Returns (resumes, errors) with the same shape as fetch_all_resumes().
    """
    import re as _re
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except FileNotFoundError:
        return [], [f"Local resumes file not found: {file_path}"]
    except Exception as e:
        return [], [f"Failed to read local resumes file: {e}"]

    parts = _re.split(r"===RESUME\s*\d+===", raw, flags=_re.IGNORECASE)
    resumes = []
    for i, part in enumerate(parts):
        text = part.strip()
        if not text:
            continue
        first_line = next((l.strip() for l in text.splitlines() if l.strip()), f"Candidate {i}")
        name = first_line.replace("Name:", "").strip() if first_line.lower().startswith("name:") else first_line
        resumes.append({
            "id":          f"local-{i}",
            "name":        f"{name}.txt",
            "text":        text,
            "webViewLink": "",
        })

    print(f"[Pipeline] Loaded {len(resumes)} resume(s) from local file (fallback): {file_path}")
    return resumes, []


# ─────────────────────────────────────────────────────────────
# HELPER: build a fake ParsedResume from a stored page_index tree
# ─────────────────────────────────────────────────────────────
def _page_index_to_resume_text(page_index: dict) -> str:
    """
    Serialise the stored PageIndex tree back to a readable text
    that match_resume_to_jd() can consume.
    """
    identity  = page_index.get("identity", {})
    skills    = page_index.get("skills", {})
    exp       = page_index.get("experience", {})
    edu       = page_index.get("education", {})
    narrative = page_index.get("narrative", {})

    lines: List[str] = []
    lines.append(f"Name: {identity.get('name', '')}")
    if identity.get("current_role"):
        lines.append(f"Current Role: {identity['current_role']}")
    if identity.get("experience_years"):
        lines.append(f"Experience: {identity['experience_years']} years")
    if identity.get("email"):
        lines.append(f"Email: {identity['email']}")

    all_skills = skills.get("all", [])
    if all_skills:
        lines.append(f"Skills: {', '.join(all_skills)}")

    if edu.get("summary"):
        lines.append(f"Education: {edu['summary']}")
    if edu.get("certifications"):
        lines.append(f"Certifications: {', '.join(edu['certifications'])}")

    for item in (exp.get("timeline") or []):
        title   = item.get("title", "")
        company = item.get("company", "")
        dur     = item.get("duration", "")
        lines.append(f"\n{title} at {company} ({dur})")
        for r in (item.get("key_responsibilities") or []):
            lines.append(f"  - {r}")

    if narrative.get("summary"):
        lines.append(f"\nSummary: {narrative['summary']}")

    return "\n".join(lines)


def _page_index_to_parsed_dict(page_index: dict) -> dict:
    """Convert stored page_index tree back to a parsed resume dict."""
    identity  = page_index.get("identity", {})
    skills    = page_index.get("skills", {})
    exp       = page_index.get("experience", {})
    edu       = page_index.get("education", {})
    narrative = page_index.get("narrative", {})

    work_history = [
        {
            "title":            item.get("title"),
            "company":          item.get("company"),
            "duration":         item.get("duration"),
            "responsibilities": item.get("key_responsibilities") or [],
        }
        for item in (exp.get("timeline") or [])
    ]

    return {
        "name":             identity.get("name", "Unknown"),
        "email":            identity.get("email"),
        "phone":            identity.get("phone"),
        "current_role":     identity.get("current_role"),
        "experience_years": identity.get("experience_years", 0),
        "skills":           skills.get("all", []),
        "education":        edu.get("summary"),
        "certifications":   edu.get("certifications", []),
        "work_history":     work_history,
        "summary":          narrative.get("summary"),
    }


# ─────────────────────────────────────────────────────────────
# HELPER: match one stored profile against JD (no LLM — pure DB data)
# ─────────────────────────────────────────────────────────────
def _match_profile(
    profile:     CandidateProfile,
    jd_data:     dict,
    jd_raw_text: str,  # kept for signature compatibility; not used
) -> Tuple[Optional[CandidateMatchResult], Optional[str]]:
    """
    Programmatic matching from stored page_index — zero LLM calls.
    Skill comparison + experience + education scoring give deterministic results.
    """
    try:
        page_index  = profile.page_index or {}
        parsed_dict = _page_index_to_parsed_dict(page_index)

        candidate_skills = parsed_dict.get("skills", [])
        candidate_exp    = float(parsed_dict.get("experience_years") or 0)
        candidate_edu    = parsed_dict.get("education") or ""

        # Programmatic match (no API call)
        match = compute_match(jd_data, candidate_skills, candidate_exp, candidate_edu)

        work_history = [
            WorkHistoryItem(
                title           = wh.get("title"),
                company         = wh.get("company"),
                duration        = wh.get("duration"),
                responsibilities= wh.get("responsibilities", []),
            )
            for wh in (parsed_dict.get("work_history") or [])
        ]

        resume_model = ParsedResume(
            name             = parsed_dict.get("name", "Unknown"),
            email            = parsed_dict.get("email"),
            phone            = parsed_dict.get("phone"),
            current_role     = parsed_dict.get("current_role"),
            experience_years = candidate_exp,
            skills           = candidate_skills,
            education        = parsed_dict.get("education"),
            certifications   = parsed_dict.get("certifications", []),
            work_history     = work_history,
            summary          = parsed_dict.get("summary"),
        )

        result = CandidateMatchResult(
            file_name        = profile.file_name,
            drive_file_id    = profile.source_file_id,
            drive_file_url   = "",
            parsed_resume    = resume_model,
            match_score      = match["match_score"],
            matched_skills   = match["matched_skills"],
            missing_skills   = match["missing_skills"],
            extra_skills     = match["extra_skills"],
            experience_match = match["experience_match"],
            ai_summary       = match["ai_summary"],
            improvement_suggestions = [],
            interview_questions     = [],
        )
        return result, None

    except Exception as e:
        return None, f"{profile.file_name}: {e}"


# ─────────────────────────────────────────────────────────────
# LEGACY HELPER: process one raw resume file (fallback path)
# ─────────────────────────────────────────────────────────────
def _process_one_resume(
    file_meta:   Dict[str, Any],
    jd_data:     Dict[str, Any],
    jd_obj:      JobDescription,
    jd_raw_text: str = "",
) -> Tuple[Optional[CandidateMatchResult], Optional[str]]:
    try:
        resume_text = file_meta["text"]
        parsed      = parse_resume(resume_text)
        match       = match_resume_to_jd(jd_data, parsed, resume_text, jd_raw_text)

        work_history = [
            WorkHistoryItem(
                title           = wh.get("title"),
                company         = wh.get("company"),
                duration        = wh.get("duration"),
                responsibilities= wh.get("responsibilities", []),
            )
            for wh in (parsed.get("work_history") or [])
        ]
        resume_model = ParsedResume(
            name             = parsed.get("name", "Unknown"),
            email            = parsed.get("email"),
            phone            = parsed.get("phone"),
            current_role     = parsed.get("current_role"),
            experience_years = float(parsed.get("experience_years") or 0),
            skills           = parsed.get("skills", []),
            education        = parsed.get("education"),
            certifications   = parsed.get("certifications", []),
            work_history     = work_history,
            summary          = parsed.get("summary"),
        )
        result = CandidateMatchResult(
            file_name       = file_meta["name"],
            drive_file_id   = file_meta["id"],
            drive_file_url  = file_meta.get("webViewLink", ""),
            parsed_resume   = resume_model,
            match_score     = match["match_score"],
            matched_skills  = match["matched_skills"],
            missing_skills  = match["missing_skills"],
            extra_skills    = match["extra_skills"],
            experience_match= match["experience_match"],
            ai_summary      = match["ai_summary"],
            improvement_suggestions = [],
            interview_questions     = [],
        )
        return result, None
    except Exception as e:
        return None, f"{file_meta.get('name', 'Unknown')}: {e}"


# ─────────────────────────────────────────────────────────────
# GET /pipeline/folders
# ─────────────────────────────────────────────────────────────
@router.get("/folders")
def search_drive_folders(
    q:            str,
    current_user: User    = Depends(get_current_user),
):
    """Search user's Google Drive for folder names matching the query."""
    if not current_user.access_token:
        raise HTTPException(status_code=403, detail="No Google Drive access token.")
    return search_folders(current_user.access_token, q)


# ─────────────────────────────────────────────────────────────
# POST /pipeline/run
# ─────────────────────────────────────────────────────────────
@router.post("/run", response_model=PipelineResponse)
def run_pipeline(
    payload:      PipelineRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Vector-less RAG Matching Pipeline.

    If indexed CandidateProfiles exist → BM25 pre-filter → LLM deep match.
    If no profiles indexed yet → fallback to live local-file parsing.
    """
    start_time = time.time()
    errors: List[str] = []

    # ── Step 1: Load JD ──────────────────────────────────────
    jd_obj = db.query(JobDescription).filter(
        JobDescription.id         == payload.jd_id,
        JobDescription.uploaded_by == current_user.id,
    ).first()

    if not jd_obj:
        raise HTTPException(status_code=404, detail="Job description not found")

    jd_raw_text = jd_obj.jd_text or ""
    jd_data = {
        "title":              jd_obj.title,
        "jd_summary":         jd_obj.jd_summary or jd_obj.title,
        "required_skills":    jd_obj.required_skills or [],
        "nice_to_have_skills": jd_obj.nice_to_have_skills or [],
        "experience_min":     jd_obj.experience_min,
        "experience_max":     jd_obj.experience_max,
        "education_required": jd_obj.education_required,
        "responsibilities":   jd_obj.responsibilities or [],
    }

    if not jd_data["required_skills"]:
        print(f"[Pipeline] WARNING: JD '{jd_obj.title}' has no required_skills — using raw text fallback.")

    # ── Step 2: Load indexed profiles (with optional stream filter) ──
    profile_query = db.query(CandidateProfile).filter(
        CandidateProfile.user_id == current_user.id
    )
    selected_streams = [s for s in (payload.streams or []) if s]
    if selected_streams:
        profile_query = profile_query.filter(
            CandidateProfile.stream.in_(selected_streams)
        )
        print(f"[Pipeline] Stream filter: {selected_streams}")

    profiles: List[CandidateProfile] = profile_query.all()

    all_results: List[CandidateMatchResult] = []
    total_files_found = 0

    if profiles:
        print(f"[Pipeline] Matching {len(profiles)} indexed profiles (programmatic, no LLM)")
        total_files_found = len(profiles)

        # ── Experience pre-filter ──────────────────────────────
        # Exclude candidates whose experience is clearly outside the JD range.
        # Keeps candidates within [experience_min - 1, experience_max + 8] to
        # allow slight under/over-qualification while still reducing noise.
        exp_min = float(jd_data.get("experience_min") or 0)
        exp_max = float(jd_data.get("experience_max") or 99)
        if exp_min > 0 or exp_max < 99:
            lower_bound = max(0.0, exp_min - 1.0)
            upper_bound = exp_max + 8.0
            before_exp_filter = len(profiles)
            profiles = [
                p for p in profiles
                if lower_bound <= float(p.experience_years or 0) <= upper_bound
            ]
            filtered_out = before_exp_filter - len(profiles)
            if filtered_out:
                print(
                    f"[Pipeline] Experience pre-filter ({exp_min}–{exp_max} yrs): "
                    f"removed {filtered_out} out-of-range profiles, "
                    f"{len(profiles)} remain"
                )

        # ── BM25 pre-filter: narrow to top-K before scoring ──
        # Only kicks in when the pool is larger than BM25_PREFILTER_K
        if len(profiles) > BM25_PREFILTER_K:
            bm25 = BM25()
            bm25.fit([p.bm25_corpus or "" for p in profiles])
            jd_query = build_jd_query(jd_data)
            top_k_indices = {idx for idx, _ in bm25.get_top_k(jd_query, k=BM25_PREFILTER_K)}
            profiles_to_score = [p for i, p in enumerate(profiles) if i in top_k_indices]
            print(f"[Pipeline] BM25 pre-filter: {len(profiles)} → {len(profiles_to_score)} candidates")
        else:
            profiles_to_score = profiles

        # Score shortlisted profiles — pure Python, instant
        for profile in profiles_to_score:
            result, err = _match_profile(profile, jd_data, jd_raw_text)
            if err:
                errors.append(err)
            elif result:
                all_results.append(result)

        # Log scores for debugging
        score_log = sorted(
            [(r.parsed_resume.name, r.match_score) for r in all_results],
            key=lambda x: x[1], reverse=True
        )
        print(f"[Pipeline] Scores: {score_log}")

    else:
        # No indexed profiles — tell the user to run the indexing pipeline first
        raise HTTPException(
            status_code=404,
            detail=(
                "No indexed candidate profiles found. "
                "Go to 'Index Resumes' and click 'Run Index Pipeline' to index resumes from "
                "your Google Drive folder before running the matching pipeline."
            ),
        )

    # ── Step 5: Filter by min_score ───────────────────────────
    above_threshold = [r for r in all_results if r.match_score >= payload.min_score]

    if not above_threshold and all_results:
        ranked_all  = sorted(all_results, key=lambda r: r.match_score, reverse=True)
        best_score  = ranked_all[0].match_score
        errors.append(
            f"No candidates scored ≥ {payload.min_score:.0f}%. "
            f"Showing best available result(s) instead (top score: {best_score:.0f}%). "
            "Consider lowering the minimum match score slider."
        )
        above_threshold = ranked_all[:payload.top_n]

    print(f"[Pipeline] threshold={payload.min_score} | above={len(above_threshold)} / {len(all_results)}")

    # ── Steps 6+7+8: Top-N enrichment ─────────────────────────
    ranked = sorted(above_threshold, key=lambda r: r.match_score, reverse=True)
    top_n  = ranked[: payload.top_n]

    # ── Step 6: Parallel improvement suggestions only ────────────
    def _enrich_candidate(candidate: CandidateMatchResult) -> CandidateMatchResult:
        parsed = candidate.parsed_resume
        resume_data = {
            "name":         parsed.name,
            "current_role": parsed.current_role,
            "skills":       parsed.skills,
        }

        candidate.improvement_suggestions = generate_improvement_suggestions(
            jd_data        = jd_data,
            resume_data    = resume_data,
            missing_skills = candidate.missing_skills,
            match_score    = candidate.match_score,
        )
        candidate.interview_questions = []
        print(f"[Pipeline] Suggestions OK for {parsed.name}: "
              f"{len(candidate.improvement_suggestions)} suggestions")
        return candidate

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        top_n = list(executor.map(_enrich_candidate, top_n))

    # ── Step 9: Executive summary ─────────────────────────────
    summary_data = [
        {
            "name":           c.parsed_resume.name,
            "current_role":   c.parsed_resume.current_role or "Unknown",
            "score":          c.match_score,
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
        jd              = JDOut.model_validate(jd_obj),
        top_candidates  = top_n,
        executive_summary = executive_summary,
        stats = PipelineStats(
            total_files_found     = total_files_found,
            total_parsed          = len(all_results),
            total_above_threshold = len(above_threshold),
            processing_time_secs  = elapsed,
        ),
        errors = errors,
    )


# ─────────────────────────────────────────────────────────────
# GET /pipeline/profile/{source_file_id}  — inspect parsed page_index as JSON
# ─────────────────────────────────────────────────────────────
@router.get("/profile/{source_file_id:path}")
def get_profile_json(
    source_file_id: str,
    db:             Session = Depends(get_db),
    current_user:   User    = Depends(get_current_user),
):
    """
    Return the full stored page_index JSON for a candidate profile.
    Useful for debugging what was parsed and stored during indexing.
    """
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.source_file_id == source_file_id,
        CandidateProfile.user_id        == current_user.id,
    ).first()

    if not profile:
        all_ids = [
            p.source_file_id for p in
            db.query(CandidateProfile.source_file_id)
            .filter(CandidateProfile.user_id == current_user.id)
            .all()
        ]
        raise HTTPException(
            status_code=404,
            detail=f"Profile not found for '{source_file_id}'. Available: {all_ids}"
        )

    return {
        "source_file_id":  profile.source_file_id,
        "file_name":       profile.file_name,
        "candidate_name":  profile.candidate_name,
        "current_role":    profile.current_role,
        "experience_years": profile.experience_years,
        "skills":          profile.skills,
        "page_index":      profile.page_index,
    }


# ─────────────────────────────────────────────────────────────
# POST /pipeline/generate-resume
# ─────────────────────────────────────────────────────────────
class GenerateResumeRequest(BaseModel):
    source_file_id: str
    skills_to_add:  List[str] = []


@router.post("/generate-resume")
def generate_updated_resume(
    payload:      GenerateResumeRequest,
    db:           Session = Depends(get_db),
    current_user: User    = Depends(get_current_user),
):
    """
    Generate an updated resume PDF for a candidate with selected skills added.
    Returns a downloadable PDF file.
    """
    print(f"[GenerateResume] user={current_user.id} source_file_id='{payload.source_file_id}' skills={payload.skills_to_add}")
    profile = db.query(CandidateProfile).filter(
        CandidateProfile.source_file_id == payload.source_file_id,
        CandidateProfile.user_id        == current_user.id,
    ).first()

    if not profile:
        # Log all stored IDs to help diagnose mismatches
        all_ids = [
            p.source_file_id for p in
            db.query(CandidateProfile.source_file_id)
            .filter(CandidateProfile.user_id == current_user.id)
            .all()
        ]
        print(f"[GenerateResume] source_file_id not found: '{payload.source_file_id}' | stored IDs: {all_ids}")
        raise HTTPException(
            status_code=404,
            detail=f"Candidate profile not found for id='{payload.source_file_id}'. Stored IDs: {all_ids}"
        )

    try:
        from services.resume_generator import build_resume_docx
        docx_bytes = build_resume_docx(profile.page_index, payload.skills_to_add)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate resume: {e}")

    safe_name = (profile.candidate_name or "resume").replace(" ", "_")
    return Response(
        content        = docx_bytes,
        media_type     = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers        = {"Content-Disposition": f'attachment; filename="{safe_name}_updated.docx"'},
    )
