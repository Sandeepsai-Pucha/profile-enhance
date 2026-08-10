"""
services/resume_chunking.py
─────────────────────────────
Chunked resume parsing — works around the per-call character/token limits
in each AI provider's parse_resume().

Problem this solves:
  Every provider's parse_resume() truncates the input to MAX_RESUME_CHARS
  and caps the output at max_tokens. Long/detailed resumes (many jobs, long
  responsibility lists) can exceed either limit — the truncated JSON then
  fails to parse and the whole resume silently comes back empty ("Unknown",
  no skills, no work history).

Fix: if a resume fits within the provider's own limit, parse it in one call
exactly as before (no behavior change, no extra cost). If it's longer, split
it into overlapping chunks that each fit the limit, parse each chunk with
the same parse_resume() function, and merge the structured results back
into one profile (union skills/certifications, concatenate work history
with dedup, keep the first non-empty scalar field found).
"""

from typing import Any, Callable, Dict, List

# Overlap between consecutive chunks so a job entry or bullet point that
# straddles a chunk boundary still appears complete in at least one chunk.
_CHUNK_OVERLAP_CHARS = 600


def _split_into_chunks(text: str, chunk_chars: int, overlap: int) -> List[str]:
    if len(text) <= chunk_chars:
        return [text]

    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = start + chunk_chars
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


def _merge_parsed_chunks(chunks: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Combine multiple parse_resume() results (one per chunk) into one profile."""
    merged: Dict[str, Any] = {
        "name": None, "email": None, "phone": None, "current_role": None,
        "experience_years": 0, "skills": [], "education": None,
        "certifications": [], "work_history": [], "summary": None,
        "summary_points": [],
    }

    seen_skills: set = set()
    seen_certs:  set = set()
    seen_jobs:   set = set()

    for c in chunks:
        for field in ("name", "email", "phone", "current_role", "education", "summary"):
            value = c.get(field)
            current = merged.get(field)
            if value and value != "Unknown" and (not current or current == "Unknown"):
                merged[field] = value

        try:
            merged["experience_years"] = max(
                float(merged["experience_years"] or 0), float(c.get("experience_years") or 0)
            )
        except (TypeError, ValueError):
            pass

        for skill in (c.get("skills") or []):
            key = str(skill).strip().lower()
            if key and key not in seen_skills:
                seen_skills.add(key)
                merged["skills"].append(skill)

        for cert in (c.get("certifications") or []):
            key = str(cert).strip().lower()
            if key and key not in seen_certs:
                seen_certs.add(key)
                merged["certifications"].append(cert)

        for job in (c.get("work_history") or []):
            key = (
                str(job.get("title") or "").strip().lower(),
                str(job.get("company") or "").strip().lower(),
                str(job.get("duration") or "").strip().lower(),
            )
            if key not in seen_jobs:
                seen_jobs.add(key)
                merged["work_history"].append(job)

        for point in (c.get("summary_points") or []):
            if point not in merged["summary_points"]:
                merged["summary_points"].append(point)

    if not merged["name"]:
        merged["name"] = "Unknown"
    return merged


def parse_resume_chunked(
    parse_fn:     Callable[..., Dict[str, Any]],
    resume_text:  str,
    resume_label: str = "",
    chunk_chars:  int = 20000,
) -> Dict[str, Any]:
    """
    Parse a resume using `parse_fn` (a provider's parse_resume), chunking the
    input if it exceeds `chunk_chars` (pass the provider's own MAX_RESUME_CHARS
    so each chunk is guaranteed to fit that provider's limit).
    """
    chunks = _split_into_chunks(resume_text, chunk_chars, _CHUNK_OVERLAP_CHARS)

    if len(chunks) == 1:
        return parse_fn(resume_text, resume_label=resume_label)

    print(f"[Chunking] '{resume_label}' is {len(resume_text)} chars — "
          f"splitting into {len(chunks)} chunks of ~{chunk_chars} chars")

    parsed_chunks = []
    for i, chunk in enumerate(chunks):
        label = f"{resume_label} [chunk {i + 1}/{len(chunks)}]" if resume_label else f"chunk {i + 1}/{len(chunks)}"
        parsed_chunks.append(parse_fn(chunk, resume_label=label))

    return _merge_parsed_chunks(parsed_chunks)
