"""
services/bm25_service.py
─────────────────────────
Pure-Python BM25 (Best Match 25) implementation.
No external dependencies required — works on CPU with no embeddings.

Algorithm:
  score(q, d) = Σ IDF(t) * tf(t,d)*(k1+1) / (tf(t,d) + k1*(1-b+b*|d|/avgdl))

Default parameters (Okapi BM25 standard):
  k1 = 1.5  (term frequency saturation)
  b  = 0.75 (document length normalisation)
"""

import math
import re
from typing import List, Dict, Tuple


# ─────────────────────────────────────────────────────────────
# Tokenizer
# ─────────────────────────────────────────────────────────────
def tokenize(text: str) -> List[str]:
    """
    Lowercase and split on non-alphanumeric characters.
    Preserves common tech tokens like "c++", "node.js", ".net".
    """
    if not text:
        return []
    # Lowercase first
    text = text.lower()
    # Split on whitespace and common separators, keep alphanumeric + . + # + +
    tokens = re.findall(r"[a-z0-9][a-z0-9+#.]*", text)
    return [t.rstrip(".") for t in tokens if len(t) >= 2]


# ─────────────────────────────────────────────────────────────
# BM25 Engine
# ─────────────────────────────────────────────────────────────
class BM25:
    """
    BM25 scorer.  Fit once on a corpus, then call get_scores() repeatedly.

    Usage:
        bm25 = BM25()
        bm25.fit(["python fastapi resume ...", "java spring developer ..."])
        scores = bm25.get_scores("python developer fastapi")
        top_k  = bm25.get_top_k("python developer", k=5)
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b  = b
        self._fitted = False

        self.n_docs:             int                  = 0
        self.doc_freqs:          List[Dict[str, int]] = []
        self.doc_len:            List[int]            = []
        self.avgdl:              float                = 0.0
        self.idf:                Dict[str, float]     = {}

    # ── fit ───────────────────────────────────────────────────
    def fit(self, corpus: List[str]) -> "BM25":
        """
        Fit BM25 on a list of documents.
        Each document should be the pre-built bm25_corpus string.
        """
        if not corpus:
            self._fitted = True
            return self

        self.n_docs = len(corpus)
        tokenized   = [tokenize(doc) for doc in corpus]
        self.doc_len = [len(t) for t in tokenized]
        self.avgdl  = sum(self.doc_len) / self.n_docs

        # Per-document term frequencies
        self.doc_freqs = []
        df: Dict[str, int] = {}
        for tokens in tokenized:
            freq: Dict[str, int] = {}
            for tok in tokens:
                freq[tok] = freq.get(tok, 0) + 1
            self.doc_freqs.append(freq)
            for tok in freq:
                df[tok] = df.get(tok, 0) + 1

        # Inverse document frequency (Robertson-Sparck Jones variant)
        self.idf = {}
        for term, doc_freq in df.items():
            self.idf[term] = math.log(
                (self.n_docs - doc_freq + 0.5) / (doc_freq + 0.5) + 1
            )

        self._fitted = True
        return self

    # ── score one document ────────────────────────────────────
    def _score_doc(self, query_tokens: List[str], doc_idx: int) -> float:
        dl      = self.doc_len[doc_idx]
        freq    = self.doc_freqs[doc_idx]
        score   = 0.0
        norm    = 1 - self.b + self.b * (dl / self.avgdl) if self.avgdl > 0 else 1.0
        for tok in query_tokens:
            tf  = freq.get(tok, 0)
            if tf == 0:
                continue
            idf = self.idf.get(tok, 0.0)
            score += idf * (tf * (self.k1 + 1)) / (tf + self.k1 * norm)
        return score

    # ── get all scores ────────────────────────────────────────
    def get_scores(self, query: str) -> List[float]:
        """Return a BM25 score for each document in the corpus."""
        if not self._fitted or self.n_docs == 0:
            return []
        query_tokens = tokenize(query)
        return [self._score_doc(query_tokens, i) for i in range(self.n_docs)]

    # ── get top-k indices ─────────────────────────────────────
    def get_top_k(self, query: str, k: int) -> List[Tuple[int, float]]:
        """
        Return list of (doc_index, score) for the top-k scoring documents.
        Sorted descending by score.
        """
        scores = self.get_scores(query)
        if not scores:
            return []
        indexed = [(i, s) for i, s in enumerate(scores)]
        indexed.sort(key=lambda x: x[1], reverse=True)
        return indexed[:k]


# ─────────────────────────────────────────────────────────────
# Corpus builder helpers
# ─────────────────────────────────────────────────────────────
def build_bm25_corpus(parsed: dict) -> str:
    """
    Flatten a parsed-resume dict into a single BM25 corpus string.

    Skill tokens are repeated 3× to boost their weight.
    Role titles are repeated 2× for moderate boost.
    """
    parts: List[str] = []

    # Skills — repeat 3× for strong boost
    skills = parsed.get("skills") or []
    skills_text = " ".join(skills)
    parts.extend([skills_text] * 3)

    # Current role — repeat 2×
    role = parsed.get("current_role") or ""
    if role:
        parts.extend([role, role])

    # Work history titles + responsibilities
    for wh in (parsed.get("work_history") or []):
        title = wh.get("title") or ""
        company = wh.get("company") or ""
        if title:
            parts.extend([title, title])  # 2×
        if company:
            parts.append(company)
        for resp in (wh.get("responsibilities") or []):
            parts.append(resp)

    # Education
    edu = parsed.get("education") or ""
    if edu:
        parts.append(edu)
    for cert in (parsed.get("certifications") or []):
        parts.append(cert)

    # Summary
    summary = parsed.get("summary") or ""
    if summary:
        parts.append(summary)

    # Experience years as text hint
    years = parsed.get("experience_years")
    if years:
        parts.append(f"{int(years)} years experience")

    return " ".join(parts)


def build_jd_query(jd_data: dict) -> str:
    """
    Build a BM25 query string from a JD data dict.
    Required skills are weighted 3×, nice-to-have 1×, responsibilities 1×.
    """
    parts: List[str] = []

    req_skills = jd_data.get("required_skills") or []
    parts.extend([" ".join(req_skills)] * 3)

    nice_skills = jd_data.get("nice_to_have_skills") or []
    if nice_skills:
        parts.append(" ".join(nice_skills))

    title = jd_data.get("title") or ""
    if title:
        parts.extend([title, title])

    for resp in (jd_data.get("responsibilities") or []):
        parts.append(resp)

    edu = jd_data.get("education_required") or ""
    if edu:
        parts.append(edu)

    return " ".join(parts)
