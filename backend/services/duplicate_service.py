"""
services/duplicate_service.py
──────────────────────────────
Near-duplicate detection for Job Descriptions.

Pure-Python, no AI call — runs before parse_jd() so a likely duplicate is
caught cheaply, without spending an AI parse on a JD the recruiter probably
didn't mean to re-upload.

Similarity = weighted blend of:
  - title similarity   (difflib.SequenceMatcher ratio)
  - jd_text similarity (Jaccard over BM25 tokenizer output)
"""

import difflib
from typing import Any, Dict, List

from services.bm25_service import tokenize

TITLE_WEIGHT = 0.4
TEXT_WEIGHT  = 0.6

DEFAULT_THRESHOLD = 0.55
DEFAULT_LIMIT     = 3


def _title_similarity(a: str, b: str) -> float:
    return difflib.SequenceMatcher(None, (a or "").strip().lower(), (b or "").strip().lower()).ratio()


def _text_similarity(a: str, b: str) -> float:
    tokens_a = set(tokenize(a or ""))
    tokens_b = set(tokenize(b or ""))
    if not tokens_a and not tokens_b:
        return 0.0
    union = tokens_a | tokens_b
    if not union:
        return 0.0
    return len(tokens_a & tokens_b) / len(union)


def jd_similarity(title_a: str, text_a: str, title_b: str, text_b: str) -> float:
    """Combined 0-1 similarity score between two JDs."""
    return (
        TITLE_WEIGHT * _title_similarity(title_a, title_b)
        + TEXT_WEIGHT * _text_similarity(text_a, text_b)
    )


def find_similar_jds(
    existing_jds:  List[Any],   # list of JobDescription ORM rows
    title:         str,
    jd_text:       str,
    threshold:     float = DEFAULT_THRESHOLD,
    limit:         int   = DEFAULT_LIMIT,
) -> List[Dict[str, Any]]:
    """
    Compare a candidate (title, jd_text) against a user's existing JDs.
    Returns the top matches at/above `threshold`, sorted by score descending.
    """
    scored = []
    for jd in existing_jds:
        score = jd_similarity(title, jd_text, jd.title, jd.jd_text)
        if score >= threshold:
            scored.append((jd, score))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return [
        {
            "id":         jd.id,
            "title":      jd.title,
            "company":    jd.company,
            "score":      round(score, 2),
            "created_at": jd.created_at.isoformat() if jd.created_at else None,
        }
        for jd, score in scored[:limit]
    ]
