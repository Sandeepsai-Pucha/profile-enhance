"""
services/matching_service.py
─────────────────────────────
Programmatic (no-LLM) resume vs JD matching.

Data for each candidate is already stored in the DB (page_index).
We compute match_score, matched_skills, missing_skills, and extra_skills
directly from that data — no API calls needed.

Scoring weights
  Skill coverage  55%  (required skills matched / total required —
                        credited from the flat skills list OR demonstrated
                        in work-history text)
  Experience fit  25%
  Nice-to-have    15%
  Education fit    5%
  BM25 relevance  +0-5 point bonus, scaled by this candidate's BM25 score
                  relative to the rest of the pool for this JD — reduces
                  identical-score ties among candidates with the same
                  skill/experience/education profile.
"""

import re
from typing import Dict, Any, List, Optional, Set

# Built-in default weights — used whenever a JD has no configured weights.
DEFAULT_WEIGHTS: Dict[str, float] = {
    "skills":       55.0,
    "experience":   25.0,
    "nice_to_have": 15.0,
    "education":     5.0,
}


# ── Semantic aliases ──────────────────────────────────────────
# Maps canonical lower-case form → canonical lower-case form.
# Any skill (from JD or resume) gets normalised through this map.
_ALIAS: Dict[str, str] = {
    # JavaScript / TypeScript
    "js":               "javascript",
    "javascript":       "javascript",
    "es6":              "javascript",
    "es6+":             "javascript",
    "es2015":           "javascript",
    "es2017":           "javascript",
    "ts":               "typescript",
    "typescript":       "typescript",
    # React
    "react":            "react",
    "react.js":         "react",
    "reactjs":          "react",
    "react js":         "react",
    "react native":     "react native",
    # Node
    "node":             "nodejs",
    "node.js":          "nodejs",
    "nodejs":           "nodejs",
    "node js":          "nodejs",
    # Vue
    "vue":              "vue",
    "vue.js":           "vue",
    "vuejs":            "vue",
    # Angular
    "angular":          "angular",
    "angularjs":        "angular",
    "angular.js":       "angular",
    # Python
    "python":           "python",
    "python3":          "python",
    # CSS / HTML
    "css":              "css",
    "css3":             "css",
    "html":             "html",
    "html5":            "html",
    # Databases
    "postgres":         "postgresql",
    "postgresql":       "postgresql",
    "mysql":            "mysql",
    "mongo":            "mongodb",
    "mongodb":          "mongodb",
    "mssql":            "sql server",
    "sql server":       "sql server",
    "sql":              "sql",
    # Cloud
    "aws":              "aws",
    "amazon web services": "aws",
    "gcp":              "gcp",
    "google cloud":     "gcp",
    "azure":            "azure",
    # DevOps / Containers
    "k8s":              "kubernetes",
    "kubernetes":       "kubernetes",
    "docker":           "docker",
    "ci/cd":            "ci/cd",
    "cicd":             "ci/cd",
    "git":              "git",
    "github":           "git",
    "gitlab":           "git",
    # REST / API
    "rest":             "rest api",
    "restful":          "rest api",
    "rest api":         "rest api",
    "restful api":      "rest api",
    "restful apis":     "rest api",
    "api":              "rest api",
    # GraphQL
    "graphql":          "graphql",
    # Data / ML
    "ml":               "machine learning",
    "machine learning": "machine learning",
    "ai":               "artificial intelligence",
    "dl":               "deep learning",
    "deep learning":    "deep learning",
    "tf":               "tensorflow",
    "tensorflow":       "tensorflow",
    "pytorch":          "pytorch",
    "pandas":           "pandas",
    "numpy":            "numpy",
    "sklearn":          "scikit-learn",
    "scikit-learn":     "scikit-learn",
    # Java / JVM
    "java":             "java",
    "spring":           "spring",
    "spring boot":      "spring boot",
    "springboot":       "spring boot",
    "maven":            "maven",
    "gradle":           "gradle",
    "kotlin":           "kotlin",
    # .NET / C#
    "c#":               "c#",
    "csharp":           "c#",
    ".net":             ".net",
    "dotnet":           ".net",
    "asp.net":          "asp.net",
    # Go / Rust
    "go":               "go",
    "golang":           "go",
    "rust":             "rust",
    # PHP / Ruby
    "php":              "php",
    "laravel":          "laravel",
    "ruby":             "ruby",
    "rails":            "ruby on rails",
    "ruby on rails":    "ruby on rails",
    # Python frameworks
    "fastapi":          "fastapi",
    "fast api":         "fastapi",
    "django":           "django",
    "flask":            "flask",
    # Frontend frameworks / tools
    "next":             "next.js",
    "next.js":          "next.js",
    "nextjs":           "next.js",
    "nuxt":             "nuxt.js",
    "nuxt.js":          "nuxt.js",
    "svelte":           "svelte",
    "tailwind":         "tailwind css",
    "tailwindcss":      "tailwind css",
    "tailwind css":     "tailwind css",
    "sass":             "sass",
    "scss":             "sass",
    # State management
    "redux":            "redux",
    "zustand":          "zustand",
    "mobx":             "mobx",
    # Testing
    "jest":             "jest",
    "pytest":           "pytest",
    "cypress":          "cypress",
    "selenium":         "selenium",
    "playwright":       "playwright",
    # Messaging / Streaming
    "kafka":            "kafka",
    "rabbitmq":         "rabbitmq",
    "redis":            "redis",
    "celery":           "celery",
    # Infrastructure / IaC
    "terraform":        "terraform",
    "ansible":          "ansible",
    "helm":             "helm",
    "jenkins":          "jenkins",
    "github actions":   "github actions",
    "gitlab ci":        "ci/cd",
    # Monitoring / Observability
    "prometheus":       "prometheus",
    "grafana":          "grafana",
    "datadog":          "datadog",
    "elasticsearch":    "elasticsearch",
    "elastic":          "elasticsearch",
    "kibana":           "kibana",
    "logstash":         "logstash",
    # Mobile
    "swift":            "swift",
    "objective-c":      "objective-c",
    "flutter":          "flutter",
    "dart":             "dart",
    "android":          "android",
    "ios":              "ios",
    # Other
    "linux":            "linux",
    "unix":             "linux",
    "bash":             "bash",
    "shell":            "bash",
    "agile":            "agile",
    "scrum":            "scrum",
    "kanban":           "kanban",
    "jira":             "jira",
    "webpack":          "webpack",
    "vite":             "vite",
    "microservices":    "microservices",
    "micro-services":   "microservices",
    "serverless":       "serverless",
    "oauth":            "oauth",
    "jwt":              "jwt",
    "websocket":        "websocket",
    "websockets":       "websocket",
}

# Words that are meaningless for skill matching — strip them from JD phrases
_NOISE_WORDS = {
    "or", "and", "similar", "frameworks", "framework", "tools", "tool",
    "libraries", "library", "technologies", "technology", "tech", "stack",
    "principles", "skills", "skill", "knowledge", "experience", "ability",
    "abilities", "strong", "good", "excellent", "proficiency", "proficient",
    "understanding", "familiarity", "including", "such", "as", "like",
    "etc", "e.g", "integration", "development", "based", "the", "a", "an",
    "of", "in", "with", "for", "to", "using", "via", "other", "related",
}


def _extract_tokens(phrase: str) -> List[str]:
    """
    Extract meaningful skill tokens from a JD phrase like
    'React.js or similar frontend frameworks' -> ['react.js', 'frontend']
    or 'JavaScript (ES6+)' -> ['javascript', 'es6+']
    """
    # Lowercase, remove parens but keep content
    text = phrase.lower()
    text = re.sub(r"[()]", " ", text)
    # Split on separators
    tokens = re.split(r"[\s,/]+", text)
    # Remove noise words and very short tokens
    return [t.strip(".,;:+") for t in tokens
            if t.strip(".,;:+") and t.strip(".,;:+") not in _NOISE_WORDS and len(t.strip(".,;:+")) >= 2]


def _canonical(skill: str) -> str:
    """Return the canonical form of a skill string (single word/phrase)."""
    key = skill.lower().strip()
    return _ALIAS.get(key, key)


def _skill_to_canonical_set(phrase: str) -> Set[str]:
    """
    Convert a skill phrase (possibly verbose) to a set of canonical forms.
    e.g. 'React.js or similar frontend frameworks' -> {'react', 'frontend'}
         'JavaScript (ES6+)' -> {'javascript'}
    """
    # First try the whole phrase as-is
    canon = _canonical(phrase)
    if canon != phrase.lower().strip():
        # Exact alias hit — return just that
        return {canon}

    # Otherwise extract tokens and canonicalize each
    tokens = _extract_tokens(phrase)
    result = set()
    for tok in tokens:
        result.add(_canonical(tok))
    return result if result else {phrase.lower().strip()}


def _skill_mentioned_in_text(jd_phrase: str, text_lower: str) -> bool:
    """
    Check if any canonical form of a JD skill phrase appears in free text
    (e.g. work-history responsibilities/descriptions), for skills a candidate
    demonstrated on the job but didn't list in their flat skills array.
    """
    if not text_lower:
        return False
    for canon in _skill_to_canonical_set(jd_phrase):
        if len(canon) >= 3 and canon in text_lower:
            return True
    return False


def _skills_match(jd_phrase: str, cand_set: Set[str]) -> bool:
    """
    Return True if ANY canonical form of the JD phrase matches ANY
    canonical form in the candidate skill set.

    Also checks for substring containment so "React 18" matches "react",
    and "React" matches "react hooks" etc.
    """
    jd_canonicals = _skill_to_canonical_set(jd_phrase)

    # Exact canonical match
    if jd_canonicals & cand_set:
        return True

    # Substring match: a JD canonical is contained in a candidate skill or vice-versa
    for jd_c in jd_canonicals:
        for cand_c in cand_set:
            if len(jd_c) >= 3 and len(cand_c) >= 3:
                if jd_c in cand_c or cand_c in jd_c:
                    return True

    return False


def compute_match(
    jd_data:            Dict[str, Any],
    candidate_skills:   List[str],
    candidate_exp:      float,
    candidate_edu:      str = "",
    work_history_text:  str = "",
    bm25_bonus:         float = 0.0,
    weights:            Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """
    Compute match_score, matched_skills, missing_skills, extra_skills,
    experience_match purely from stored data — no LLM call.

    work_history_text: concatenated job titles/technologies/descriptions/
    responsibilities. A required skill demonstrated here but not listed in
    the flat skills array still counts as matched.

    bm25_bonus: small additive score (already scaled by the caller, e.g.
    0-5 points) reflecting this candidate's BM25 relevance to the JD
    relative to the rest of the pool — differentiates candidates who'd
    otherwise land on an identical skill/experience/education score.

    weights: per-JD override of {"skills", "experience", "nice_to_have",
    "education"} point maximums (should sum to 100). Falls back to
    DEFAULT_WEIGHTS when not provided — same values this function always
    used before weights became configurable.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}

    required     = jd_data.get("required_skills", [])
    nice_to_have = jd_data.get("nice_to_have_skills", [])
    exp_min      = float(jd_data.get("experience_min") or 0)
    exp_max      = float(jd_data.get("experience_max") or 99)
    edu_required = (jd_data.get("education_required") or "").lower()

    # Build candidate canonical set — each skill may produce multiple tokens
    cand_set: Set[str] = set()
    for s in candidate_skills:
        cand_set.update(_skill_to_canonical_set(s))

    work_history_lower = work_history_text.lower()

    # ── Skill matching ────────────────────────────────────────
    matched: List[str] = []
    missing: List[str] = []

    for skill in required:
        if _skills_match(skill, cand_set):
            matched.append(skill)
        elif _skill_mentioned_in_text(skill, work_history_lower):
            matched.append(skill)
        else:
            missing.append(skill)

    # Extra: candidate skills whose canonical form doesn't appear in any JD required phrase
    req_canonicals: Set[str] = set()
    for skill in required:
        req_canonicals.update(_skill_to_canonical_set(skill))
    extra = [s for s in candidate_skills
             if not (_skill_to_canonical_set(s) & req_canonicals)][:10]

    # ── Score: skill coverage ──────────────────────────────────
    skills_w = w["skills"]
    if required:
        skill_pct   = len(matched) / len(required)
        skill_score = skill_pct * skills_w
    else:
        skill_score = skills_w / 2
        skill_pct   = 0.5

    # ── Score: experience fit ──────────────────────────────────
    # Tapering shape is unchanged from the original fixed 25-point version —
    # just scaled proportionally by this JD's experience weight.
    exp_w = w["experience"]
    exp_k = exp_w / 25.0
    if exp_min <= candidate_exp <= exp_max:
        exp_score = exp_w
    elif candidate_exp < exp_min:
        gap = exp_min - candidate_exp
        exp_score = max(0.0, exp_w - gap * 5 * exp_k)
    else:
        # Over-qualified: taper score based on how far above exp_max
        overshoot = candidate_exp - exp_max
        exp_score = max(10.0 * exp_k, (exp_w - 3 * exp_k) - overshoot * 1.5 * exp_k)

    # ── Score: nice-to-have bonus ──────────────────────────────
    nice_w = w["nice_to_have"]
    if nice_to_have:
        nth_matched = sum(1 for s in nice_to_have if _skills_match(s, cand_set))
        nice_score  = (nth_matched / len(nice_to_have)) * nice_w
    else:
        nice_score  = nice_w / 2

    # ── Score: education fit ───────────────────────────────────
    edu_w = w["education"]
    edu_score = 0.0
    if not edu_required or edu_required in ("not specified", "null", "none"):
        edu_score = edu_w / 2  # no requirement — neutral
    elif candidate_edu:
        cand_edu_lower = candidate_edu.lower()
        # Check for degree level keywords
        _EDU_LEVELS = ["phd", "doctorate", "master", "bachelor", "associate", "diploma", "degree"]
        jd_level = next((lvl for lvl in _EDU_LEVELS if lvl in edu_required), None)
        cand_level = next((lvl for lvl in _EDU_LEVELS if lvl in cand_edu_lower), None)
        if jd_level and cand_level:
            jd_idx   = _EDU_LEVELS.index(jd_level)
            cand_idx = _EDU_LEVELS.index(cand_level)
            # Higher index = lower degree; candidate meets or exceeds requirement
            edu_score = edu_w if cand_idx <= jd_idx else edu_w / 2
        else:
            # Fallback: any education mentioned is a partial match
            edu_score = edu_w / 2
    # else: edu required but candidate has none → 0

    total = round(min(100.0, max(0.0, skill_score + exp_score + nice_score + edu_score + bm25_bonus)), 1)

    # ── Experience match label ────────────────────────────────
    if candidate_exp < exp_min:
        exp_match = "Under-qualified"
    elif candidate_exp > exp_max + 3:
        exp_match = "Over-qualified"
    else:
        exp_match = "Good fit"

    # ── Summary ───────────────────────────────────────────────
    if required:
        summary = (
            f"Matches {len(matched)} of {len(required)} required skills "
            f"({int(skill_pct * 100)}% coverage). "
            f"Experience: {candidate_exp:.0f} yr(s) "
            f"(required {int(exp_min)}–{int(exp_max) if exp_max < 99 else int(exp_min) + 10}+ yr). "
        )
        if missing:
            summary += f"Gaps: {', '.join(missing[:3])}{'...' if len(missing) > 3 else ''}."
    else:
        summary = (
            f"No specific required skills listed in JD. "
            f"Candidate has {len(candidate_skills)} skills on profile."
        )

    return {
        "match_score":      total,
        "matched_skills":   matched,
        "missing_skills":   missing,
        "extra_skills":     extra,
        "experience_match": exp_match,
        "ai_summary":       summary,
    }
