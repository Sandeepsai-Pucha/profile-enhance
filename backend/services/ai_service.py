"""
services/ai_service.py
──────────────────────
All interactions with the Anthropic Claude API live here.
Three main capabilities:
  1. parse_jd()              – extract structured info from raw JD text
  2. match_candidate()       – score a single candidate against a JD
  3. generate_interview_qs() – create role-specific interview questions
"""

import os
import json
import re
from typing import List, Dict, Any
import anthropic
from dotenv import load_dotenv

load_dotenv()

# ── Anthropic client (reads ANTHROPIC_API_KEY from env) ───────
client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Model to use across all calls
MODEL = "claude-sonnet-4-20250514"


# ─────────────────────────────────────────────────────────────
# HELPER: strip markdown code fences so json.loads() works
# ─────────────────────────────────────────────────────────────
def _clean_json(text: str) -> str:
    """Remove ```json ... ``` fences that Claude sometimes wraps around JSON."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


# ─────────────────────────────────────────────────────────────
# 1. PARSE JOB DESCRIPTION
# ─────────────────────────────────────────────────────────────
def parse_jd(jd_text: str) -> Dict[str, Any]:
    """
    Send raw JD text to Claude and extract:
      - required_skills  : list of technical/soft skills
      - experience_min   : minimum years of experience (float)
      - experience_max   : maximum years of experience (float)
      - summary          : one-line role description
    Returns a dict that we store on the JobDescription row.
    """
    prompt = f"""
You are an expert HR analyst. Analyse the following Job Description and return ONLY a JSON object
(no extra text) with this exact structure:
{{
  "required_skills": ["skill1", "skill2", ...],
  "experience_min": <number>,
  "experience_max": <number>,
  "summary": "<one sentence description of the role>"
}}

Rules:
- required_skills must be a flat list of strings (e.g. "Python", "REST APIs", "AWS")
- experience_min / experience_max are years as numbers (use 0 / 99 if not mentioned)
- Return ONLY valid JSON, no markdown, no explanation

Job Description:
{jd_text}
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text
    data = json.loads(_clean_json(raw))
    return data


# ─────────────────────────────────────────────────────────────
# 2. MATCH A CANDIDATE AGAINST A JD
# ─────────────────────────────────────────────────────────────
def match_candidate(
    jd_text: str,
    required_skills: List[str],
    candidate_resume: str,
    candidate_skills: List[str],
    candidate_experience: float,
) -> Dict[str, Any]:
    """
    Ask Claude to:
      - Calculate a match score (0-100)
      - List skills the candidate HAS from the JD
      - List skills the candidate is MISSING from the JD
      - Write a short summary explaining the match

    Returns dict with: match_score, matched_skills, missing_skills, ai_summary
    """
    prompt = f"""
You are an expert technical recruiter. Compare this candidate against the job description below.

=== JOB DESCRIPTION ===
{jd_text}

Required Skills: {", ".join(required_skills)}

=== CANDIDATE PROFILE ===
Experience: {candidate_experience} years
Skills: {", ".join(candidate_skills)}
Resume:
{candidate_resume[:3000]}   ← truncated to 3000 chars

Return ONLY a JSON object (no markdown) with this structure:
{{
  "match_score": <integer 0-100>,
  "matched_skills": ["skill1", ...],
  "missing_skills": ["skill1", ...],
  "ai_summary": "<2-3 sentence explanation of why this candidate is or isn't a good fit>"
}}
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text
    data = json.loads(_clean_json(raw))
    return data


# ─────────────────────────────────────────────────────────────
# 3. GENERATE INTERVIEW QUESTIONS
# ─────────────────────────────────────────────────────────────
def generate_interview_questions(
    job_title: str,
    required_skills: List[str],
    missing_skills: List[str],
    matched_skills: List[str],
) -> List[Dict[str, str]]:
    """
    Generate a targeted set of interview questions based on:
      - The role / JD
      - Skills the candidate already has (probe depth)
      - Skills the candidate is missing (probe gaps)

    Returns a list of dicts: [{question, category, difficulty}, ...]
    """
    prompt = f"""
You are a senior technical interviewer. Generate 8 interview questions for a candidate applying
for the role: "{job_title}".

Candidate's matched skills: {", ".join(matched_skills) or "None"}
Candidate's missing skills: {", ".join(missing_skills) or "None"}

Mix of question types:
 - 3 Technical questions (probe matched skills deeply)
 - 2 Gap questions     (test understanding of missing skills)
 - 2 Behavioural      (STAR format, relevant to role)
 - 1 Situational      (problem-solving scenario)

Return ONLY a JSON array (no markdown) of objects:
[
  {{
    "question": "<full question text>",
    "category": "Technical" | "Gap" | "Behavioural" | "Situational",
    "difficulty": "Easy" | "Medium" | "Hard"
  }},
  ...
]
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=2048,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = response.content[0].text
    questions = json.loads(_clean_json(raw))
    return questions


# ─────────────────────────────────────────────────────────────
# 4. BULK RANK CANDIDATES (optional fast path)
# ─────────────────────────────────────────────────────────────
def rank_candidates_summary(
    job_title: str,
    candidates_summary: List[Dict],
) -> str:
    """
    Given a list of {name, score, matched_skills, missing_skills},
    ask Claude to write a short executive summary ranking them.
    Used for the Final Output panel in the UI.
    """
    candidates_text = "\n".join([
        f"{i+1}. {c['name']} – Score: {c['score']}%, "
        f"Matched: {', '.join(c['matched_skills'][:3])}, "
        f"Missing: {', '.join(c['missing_skills'][:3])}"
        for i, c in enumerate(candidates_summary)
    ])

    prompt = f"""
You are a staffing consultant. Based on these candidate matches for "{job_title}", 
write a 3-4 sentence executive summary recommending who to interview first and why.
Be concise and specific.

{candidates_text}
"""
    response = client.messages.create(
        model=MODEL,
        max_tokens=512,
        messages=[{"role": "user", "content": prompt}],
    )
    return response.content[0].text.strip()
