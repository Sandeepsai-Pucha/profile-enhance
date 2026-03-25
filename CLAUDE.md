# Skillify — Claude Code Reference

AI-powered resume matching platform. Candidates are **never stored in the DB** — all resume processing is ephemeral (in-memory per pipeline run).

---

## Project Structure

```
skillify/
├── backend/               FastAPI backend
│   ├── main.py            App entry point, startup migration, /home endpoint
│   ├── models.py          SQLAlchemy models: User, JobDescription, SkillCategory
│   ├── schemas.py         Pydantic schemas: JDOut, PipelineRequest/Response, etc.
│   ├── database.py        DB connection (PostgreSQL prod / SQLite dev)
│   ├── routers/
│   │   ├── auth.py        Google OAuth2, JWT, /auth/google, /auth/callback, /auth/me
│   │   ├── jobs.py        JD CRUD: POST /jobs (text+file), GET /jobs, DELETE /jobs/{id}
│   │   └── pipeline.py    POST /pipeline/run — full 9-step ephemeral pipeline
│   └── services/
│       ├── ai_service.py          All Claude API calls (parse JD, parse resume, match, etc.)
│       └── google_drive_service.py Fetch + parse resume files from Google Drive
└── frontend/              React 18 + TypeScript + Vite + Tailwind CSS
    ├── src/
    │   ├── App.tsx          Routes: /app/home, /app/dashboard, /app/jobs, /app/pipeline
    │   ├── pages/
    │   │   ├── LoginPage.tsx        Google OAuth sign-in landing
    │   │   ├── AuthCallbackPage.tsx Handles ?token= redirect from backend
    │   │   ├── HomePage.tsx         JD upload (file/text) + recent JDs
    │   │   ├── DashboardPage.tsx    Stats + quick actions
    │   │   ├── JobsPage.tsx         JD list with expandable cards
    │   │   └── PipelinePage.tsx     Pipeline config, progress, and results
    │   ├── components/
    │   │   ├── Layout.tsx              Sidebar nav + idle-timeout wrapper
    │   │   ├── BackButton.tsx          Reusable back-arrow navigation
    │   │   ├── CandidateResultCard.tsx Full candidate result: score, skills, questions
    │   │   └── IdleWarningModal.tsx    Auto sign-out warning (13 min idle → 2 min countdown)
    │   ├── hooks/
    │   │   └── useIdleTimeout.ts   Tracks mouse/key/scroll activity
    │   ├── services/api.ts         Axios client + all API calls
    │   ├── context/AuthContext.tsx JWT storage, user state, login/logout
    │   └── types.ts                TypeScript types mirroring backend schemas
    └── .env                        VITE_API_URL, VITE_GOOGLE_CLIENT_ID, VITE_DEFAULT_DRIVE_FOLDER_ID
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy, Pydantic v2 |
| AI | Google Gemini (`gemini-1.5-flash`) — free tier, no credit card |
| Auth | Google OAuth 2.0 → JWT (HS256) |
| Drive | Google Drive API v3 (reads PDF/DOCX/TXT resumes) |
| DB | PostgreSQL (prod) / SQLite (dev) — auto-migrated on startup |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3.4 |
| State | TanStack React Query v5 |
| Color Palette | Deep Tech Blue + Neon Cyan: `#1E3A8A` primary, `#0EA5E9` secondary, `#22D3EE` accent, `#0F172A` dark sidebar |

---

## Key Architecture Decisions

### Ephemeral Pipeline (No Candidate Storage)
Resumes are fetched from Google Drive, parsed in-memory, matched, and the results returned — **nothing is written to the DB**. Only `User` and `JobDescription` rows are persisted.

### Pipeline Flow (`POST /pipeline/run`)
1. Load JD from DB
2. Fetch resume files from user's Google Drive (PDF/DOCX/TXT)
3. Parse each resume with Claude AI → `ParsedResume`
4. Match each resume against JD → `match_score` (0–100)
5. Filter by `min_score` threshold (default 40%)
6. Safety fallback: if 0 pass threshold, return best available with a warning
7. Generate improvement suggestions for top-N candidates
8. Generate interview questions (8 per candidate: 3 Technical, 2 Gap, 2 Behavioural, 1 Situational)
9. Generate executive summary → return `PipelineResponse`

Parallel processing: `ThreadPoolExecutor(max_workers=5)` for steps 3–4.

### Matching Logic (`ai_service.py → match_resume_to_jd`)
Weighted scoring sent to Claude:
- 40% required skills coverage
- 25% responsibilities / domain alignment
- 20% experience years fit
- 15% education + overall profile

**Semantic matching is explicit in the prompt**: React = React.js = ReactJS, Node = Node.js, JS = JavaScript, etc.

Scoring guide enforced in prompt:
- 80–100: Excellent fit (meets 80%+ skills)
- 60–79: Good fit (meets 60–79%)
- 40–59: Partial fit (~50%)
- 20–39: Weak fit (significant gaps)
- 0–19: Poor fit

`jd_raw_text` is passed as fallback context if the structured `required_skills` list is thin.

### Google OAuth Flow
1. Frontend → `GET /auth/google` → Google consent
2. Google → `GET /auth/callback?code=...` (backend)
3. Backend exchanges code, upserts User, issues JWT
4. Backend → `RedirectResponse` to `{FRONTEND_URL}/auth/callback?token={jwt}`
5. Frontend stores JWT, navigates to `/app/home`

### Idle Timeout
- Warn after 13 minutes of inactivity (`IdleWarningModal` with 2-min countdown)
- Auto sign-out at 15 minutes
- Activity events tracked: `mousemove`, `mousedown`, `keydown`, `touchstart`, `scroll`, `click`

### Vite Dev Config (Windows)
- `watch: { usePolling: true, interval: 100 }` — required for Windows HMR
- All proxy targets use `127.0.0.1` not `localhost` (IPv6 ECONNREFUSED fix)
- `/auth/callback` is a **frontend route** — NOT proxied to backend
- Backend `/auth/google` and `/auth/me` ARE proxied

---

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=postgresql://user:pass@localhost/skillify
GEMINI_API_KEY=AIza...          # https://aistudio.google.com/ → Get API key (free)
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
SECRET_KEY=random-jwt-secret-32-chars
FRONTEND_URL=http://localhost:5173
```

### Frontend (`.env`)
```
VITE_API_URL=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
VITE_DEFAULT_DRIVE_FOLDER_ID=1_E6X-vfQ3DDWCIGMrex9XxNntJ8v9y3E
```

---

## Running Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev          # runs: vite --force
```

---

## Database Migration
`main.py` runs `_migrate_jd_columns()` on startup — idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for all new JD fields. No migration tool required for additive changes.

---

## Common Issues & Fixes

| Problem | Cause | Fix |
|---|---|---|
| Pipeline returns 0 candidates | AI scoring too strict / semantic mismatch | Fixed: calibrated scoring guide + semantic rules + raw JD fallback + safety fallback showing best results |
| OAuth redirect loop | `/auth/callback` being proxied to backend | Fixed: split proxy — only `/auth/google` and `/auth/me` are proxied |
| ECONNREFUSED `::1:8000` | Vite resolved `localhost` to IPv6 | Fixed: all proxy targets use `127.0.0.1` |
| HMR not refreshing on Windows | Node file watcher misses saves | Fixed: `usePolling: true, interval: 100` in vite.config.ts |
| Backend returns JSON instead of redirecting after OAuth | Old code returned `{access_token, token_type}` | Fixed: now `RedirectResponse` to frontend callback URL |

---

## Adding New Features

### New Backend Endpoint
1. Add route to appropriate router in `routers/`
2. Add Pydantic schema in `schemas.py`
3. If new DB columns needed, add to `models.py` AND add to `_migrate_jd_columns()` in `main.py`
4. Add proxy entry in `frontend/vite.config.ts` if needed

### New Frontend Page
1. Create `src/pages/NewPage.tsx`
2. Add route in `App.tsx` under the `<Layout>` route
3. Add nav item in `Layout.tsx` `NAV_ITEMS` array
4. Add `<BackButton to="/app/..." label="Back to ..." />` at the top of the page
5. Use color palette: primary buttons `bg-blue-900 hover:bg-blue-950`, accents `cyan-400`, secondary text `sky-500`

### New AI Function
1. Add function to `services/ai_service.py`
2. Follow pattern: `_call_claude(prompt)` → `_parse_json(raw, fallback)` → validate/default fields
3. Always include a `try/except` that returns the fallback value
4. Import and call from `routers/pipeline.py`

---

## Google Drive Resume Fetching
- Fetches files with mimeType `application/pdf`, `application/vnd.openxmlformats...docx`, `text/plain`
- Searches within `drive_folder_id` if provided, else entire Drive
- Default folder ID is set via `VITE_DEFAULT_DRIVE_FOLDER_ID` env var
- After JD upload, the pipeline page is pre-filled with the default folder

## File Size / Type Limits (JD Upload)
- Max size: 10 MB
- Accepted: `.pdf`, `.docx`, `.txt`
- Error codes: 413 (too large), 415 (unsupported type), 422 (empty), 502 (AI parse fail)
