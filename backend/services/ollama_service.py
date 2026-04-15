"""
services/ollama_service.py
──────────────────────────
Drop-in replacement for ai_service.py using a local Ollama model.

Same function signatures as ai_service.py — switch between them via
the AI_PROVIDER env var in backend/.env:

    AI_PROVIDER=ollama   # use this file
    AI_PROVIDER=gemini   # use ai_service.py (default)

Run Ollama locally before starting the backend:
    ollama run llama3.1

Config env vars (optional — defaults shown):
    OLLAMA_URL=http://localhost:11434
    OLLAMA_MODEL=llama3.1
"""

import json
import re
import os
from typing import List, Dict, Any

import httpx

OLLAMA_URL   = os.getenv("OLLAMA_URL",   "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")

MAX_RESUME_CHARS = 6000


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────
def _clean_json(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$",           "", text, flags=re.MULTILINE)
    return text.strip()


def _parse_json(raw: str, fallback: Any) -> Any:
    try:
        return json.loads(_clean_json(raw))
    except (json.JSONDecodeError, ValueError):
        match = re.search(r"(\{.*\}|\[.*\])", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except Exception:
                pass
        return fallback


def _call_ollama(prompt: str) -> str:
    """Send a prompt to the local Ollama server and return the text response."""
    response = httpx.post(
        f"{OLLAMA_URL}/api/generate",
        json={
            "model":  OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "num_predict": 2048,
            },
        },
        timeout=600.0,
    )
    response.raise_for_status()
    return response.json()["response"]


# ═══════════════════════════════════════════════════════════════
# 1. PARSE JOB DESCRIPTION
# ═══════════════════════════════════════════════════════════════
def parse_jd(jd_text: str) -> Dict[str, Any]:
    prompt = f"""You are a senior HR analyst. Analyse this Job Description and return ONLY a
valid JSON object with EXACTLY this structure (no extra keys, no markdown):

{{
  "required_skills":     ["skill1", "skill2"],
  "nice_to_have_skills": ["skill1", "skill2"],
  "experience_min":      0,
  "experience_max":      99,
  "education_required":  "Bachelor's degree in Computer Science or equivalent",
  "employment_type":     "Full-time",
  "location":            "Remote / Hybrid – City, Country",
  "responsibilities":    ["responsibility 1", "responsibility 2"],
  "benefits":            ["benefit 1", "benefit 2"],
  "salary_range":        "$100k – $130k",
  "jd_summary":          "2-sentence plain-English summary of the role"
}}

Rules:
- required_skills: must-have technical and soft skills
- nice_to_have_skills: "preferred" / "bonus" skills only
- experience_min / experience_max: integer years (0 / 99 if not stated)
- employment_type: one of Full-time | Part-time | Contract | Internship | Freelance
- location: exactly as stated or "Not specified"
- education_required: null if not mentioned
- salary_range: null if not mentioned
- Return ONLY the JSON object — no explanation, no markdown

Job Description:
{jd_text}
"""
    try:
        raw  = _call_ollama(prompt)
        data = _parse_json(raw, {})
        for key in ("required_skills", "nice_to_have_skills", "responsibilities", "benefits"):
            if not isinstance(data.get(key), list):
                data[key] = []
        data.setdefault("experience_min", 0)
        data.setdefault("experience_max", 99)
        return data
    except Exception as e:
        print(f"[Ollama] parse_jd failed: {e}")
        return {
            "required_skills": [], "nice_to_have_skills": [],
            "experience_min": 0, "experience_max": 99,
            "education_required": None, "employment_type": None,
            "location": None, "responsibilities": [], "benefits": [],
            "salary_range": None, "jd_summary": None,
        }


# ═══════════════════════════════════════════════════════════════
# 2. PARSE RESUME
# ═══════════════════════════════════════════════════════════════
def parse_resume(resume_text: str) -> Dict[str, Any]:
    truncated = resume_text[:MAX_RESUME_CHARS]

    prompt = f"""You are an expert resume parser. Extract structured information from this resume
and return ONLY a valid JSON object with EXACTLY this structure (no markdown):

{{
  "name":             "Full Name",
  "email":            "email@example.com",
  "phone":            "+1-555-000-0000",
  "current_role":     "Current or most recent job title",
  "experience_years": 5.0,
  "skills":           ["Python", "AWS", "React"],
  "education":        "B.Tech CSE – XYZ University (2019)",
  "certifications":   ["AWS Certified Solutions Architect"],
  "work_history": [
    {{
      "title":            "Software Engineer",
      "company":          "ABC Corp",
      "duration":         "Jan 2021 – Present",
      "technologies":     "React.js, Node.js, AWS Lambda, MySQL",
      "description":      "One sentence project/role description",
      "responsibilities": ["Built REST APIs", "Led team of 3"]
    }}
  ],
  "summary": "One-paragraph professional summary"
}}

Rules:
- experience_years: total professional experience as a decimal number
- skills: flat list of ALL technical and soft skills mentioned anywhere in the resume
- If a field is not present, use null for strings, [] for arrays, 0 for numbers
- Return ONLY the JSON — no explanation

Resume:
{truncated}
"""
    try:
        raw  = _call_ollama(prompt)
        data = _parse_json(raw, {})
        data.setdefault("name", "Unknown")
        data.setdefault("skills", [])
        data.setdefault("certifications", [])
        data.setdefault("work_history", [])
        data.setdefault("experience_years", 0)
        return data
    except Exception as e:
        print(f"[Ollama] parse_resume failed: {e}")
        return {
            "name": "Unknown", "email": None, "phone": None,
            "current_role": None, "experience_years": 0,
            "skills": [], "education": None,
            "certifications": [], "work_history": [], "summary": None,
        }


# ═══════════════════════════════════════════════════════════════
# 3. MATCH RESUME TO JD
# ═══════════════════════════════════════════════════════════════
def match_resume_to_jd(
    jd_data:     Dict[str, Any],
    resume_data: Dict[str, Any],
    resume_text: str,
    jd_raw_text: str = "",
) -> Dict[str, Any]:
    required_skills  = jd_data.get("required_skills", [])
    candidate_skills = resume_data.get("skills", [])
    exp_min          = jd_data.get("experience_min", 0)
    exp_max          = jd_data.get("experience_max", 99)
    candidate_exp    = resume_data.get("experience_years", 0)

    jd_context = ""
    if len(required_skills) < 3 and jd_raw_text:
        jd_context = f"\nFull JD Text (use this to infer required skills):\n{jd_raw_text[:2000]}"

    prompt = f"""You are an experienced technical recruiter performing an objective resume evaluation.

=== JOB DESCRIPTION ===
Role: {jd_data.get('jd_summary') or jd_data.get('title', 'Not provided')}
Required Skills: {', '.join(required_skills) or 'See full JD text below'}
Nice-to-have: {', '.join(jd_data.get('nice_to_have_skills', [])) or 'None'}
Experience Required: {exp_min}–{exp_max} years
Education: {jd_data.get('education_required') or 'Not specified'}
Key Responsibilities: {'; '.join((jd_data.get('responsibilities') or [])[:5]) or 'Not specified'}{jd_context}

=== CANDIDATE PROFILE ===
Name: {resume_data.get('name', 'Unknown')}
Current Role: {resume_data.get('current_role') or 'Unknown'}
Experience: {candidate_exp} years
Skills: {', '.join(candidate_skills) or 'See resume text below'}
Education: {resume_data.get('education') or 'Not specified'}
Resume:
{resume_text[:3000]}

Evaluate the candidate and return ONLY this JSON (no markdown, no explanation):
{{
  "match_score":      75,
  "matched_skills":   ["Python", "FastAPI"],
  "missing_skills":   ["Kubernetes", "Terraform"],
  "extra_skills":     ["Perl", "COBOL"],
  "experience_match": "Good fit",
  "ai_summary":       "3-sentence assessment of overall fit, strengths, and gaps"
}}

=== SCORING GUIDE ===
- 80-100: Excellent fit — meets 80%+ required skills
- 60-79:  Good fit     — meets 60-79% required skills
- 40-59:  Partial fit  — meets ~half the required skills
- 20-39:  Weak fit     — significant gaps
-  0-19:  Poor fit     — few or no matching skills

=== MATCHING RULES ===
1. Semantic matching: "React" = "React.js" = "ReactJS"; "Node" = "Node.js";
   "JS" = "JavaScript"; "TS" = "TypeScript"; "Postgres" = "PostgreSQL";
   "Mongo" = "MongoDB"; "K8s" = "Kubernetes".
2. Count a skill as matched if demonstrated in projects/work experience too.
3. 3 of 5 required skills → at least 40 score; 4 of 5 → at least 55 score.
4. Do NOT penalise for missing nice-to-have skills.
5. experience_match: "Under-qualified" | "Good fit" | "Over-qualified"

Return ONLY valid JSON — no markdown fences, no extra text.
"""
    try:
        raw  = _call_ollama(prompt)
        data = _parse_json(raw, {})
        data.setdefault("match_score", 0)
        data.setdefault("matched_skills", [])
        data.setdefault("missing_skills", [])
        data.setdefault("extra_skills", [])
        data.setdefault("experience_match", "Good fit")
        data.setdefault("ai_summary", "Analysis unavailable.")
        data["match_score"] = max(0, min(100, float(data["match_score"])))
        print(f"[Ollama] Match score for {resume_data.get('name', 'Unknown')}: {data['match_score']}")
        return data
    except Exception as e:
        print(f"[Ollama] match_resume_to_jd failed: {e}")
        return {
            "match_score": 0, "matched_skills": [], "missing_skills": [],
            "extra_skills": [], "experience_match": "Unknown",
            "ai_summary": f"Match analysis failed: {e}",
        }


# ═══════════════════════════════════════════════════════════════
# 4. IMPROVEMENT SUGGESTIONS
# ═══════════════════════════════════════════════════════════════
def generate_improvement_suggestions(
    jd_data:        Dict[str, Any],
    resume_data:    Dict[str, Any],
    missing_skills: List[str],
    match_score:    float,
) -> List[str]:
    prompt = f"""You are a professional resume coach helping a candidate improve their resume
to better match this specific job description.

Role: {jd_data.get('jd_summary', '')}
Missing Skills: {', '.join(missing_skills) or 'None identified'}
Current Match Score: {match_score:.0f}/100
Candidate's Current Role: {resume_data.get('current_role', 'Unknown')}
Candidate's Skills: {', '.join(resume_data.get('skills', [])[:15])}

Return ONLY a JSON array of 4-6 specific, actionable improvement suggestions (strings).
Each suggestion must be concrete and tailored — not generic advice.

Example:
["Add a dedicated Skills section listing AWS services you've used (S3, EC2, RDS)",
 "Quantify your API performance improvements with metrics (e.g., 'reduced latency by 40%')"]

Return ONLY the JSON array — no explanation, no markdown.
"""
    try:
        raw  = _call_ollama(prompt)
        data = _parse_json(raw, [])
        if isinstance(data, list):
            return [str(s) for s in data[:6]]
        return []
    except Exception as e:
        print(f"[Ollama] generate_improvement_suggestions failed: {e}")
        return ["Unable to generate suggestions at this time."]


# ═══════════════════════════════════════════════════════════════
# 5. INTERVIEW QUESTIONS
# ═══════════════════════════════════════════════════════════════
def generate_interview_questions(
    job_title:       str,
    jd_summary:      str,
    required_skills: List[str],
    matched_skills:  List[str],
    missing_skills:  List[str],
    candidate_name:  str,
    candidate_role:  str,
) -> List[Dict[str, str]]:
    prompt = f"""You are a senior technical interviewer preparing for an interview.

Role: {job_title}
JD Summary: {jd_summary}

Candidate: {candidate_name} ({candidate_role})
Candidate's matched skills: {', '.join(matched_skills) or 'None'}
Candidate's skill gaps:     {', '.join(missing_skills) or 'None'}

Generate exactly 8 interview questions:
 - 3 Technical   (probe depth in matched skills)
 - 2 Gap         (assess knowledge of missing skills — be constructive)
 - 2 Behavioural (STAR format, relevant to the role)
 - 1 Situational (real-world problem-solving scenario)

Return ONLY a JSON array (no markdown):
[
  {{
    "question":   "Full question text",
    "category":   "Technical",
    "difficulty": "Medium"
  }}
]

difficulty: Easy | Medium | Hard
category:   Technical | Gap | Behavioural | Situational
"""
    try:
        raw  = _call_ollama(prompt)
        data = _parse_json(raw, [])
        if isinstance(data, list):
            return data[:8]
        return []
    except Exception as e:
        print(f"[Ollama] generate_interview_questions failed: {e}")
        return []


# ═══════════════════════════════════════════════════════════════
# 6. EXECUTIVE SUMMARY
# ═══════════════════════════════════════════════════════════════
def generate_executive_summary(
    job_title:      str,
    jd_summary:     str,
    top_candidates: List[Dict[str, Any]],
) -> str:
    if not top_candidates:
        return "No candidates met the minimum match threshold for this role."

    candidate_lines = "\n".join([
        f"{i+1}. {c['name']} ({c['current_role']}) — Score: {c['score']:.0f}% | "
        f"Matched: {', '.join(c['matched_skills'][:3])} | "
        f"Missing: {', '.join(c['missing_skills'][:3])}"
        for i, c in enumerate(top_candidates)
    ])

    prompt = f"""You are a staffing consultant. Write a 4-5 sentence executive summary for the
hiring manager, recommending candidates for the following role.

Role: {job_title}
Description: {jd_summary}

Top Candidates (ranked by match score):
{candidate_lines}

Be specific: mention names, key strengths, and primary concerns.
Recommend who to interview first and why. Plain text only — no bullet points, no markdown.
"""
    try:
        return _call_ollama(prompt).strip()
    except Exception as e:
        print(f"[Ollama] generate_executive_summary failed: {e}")
        return "Executive summary could not be generated."
