# 🚀 Skillify – AI-Based Profile Matching & Interview Preparation

> Match candidates to job descriptions instantly using Claude AI.  
> Generate tailored interview questions. Identify skill gaps. All in one tool.

---

## 📁 Project Structure

```
skillify/
├── backend/                   ← FastAPI + Python
│   ├── main.py                ← App entry point
│   ├── database.py            ← PostgreSQL connection (SQLAlchemy)
│   ├── models.py              ← ORM table definitions
│   ├── schemas.py             ← Pydantic request/response models
│   ├── seed_data.py           ← 🌱 Test data (run this first!)
│   ├── requirements.txt
│   ├── .env.example           ← Copy to .env and fill in keys
│   ├── routers/
│   │   ├── auth.py            ← Google OAuth 2.0 flow + JWT
│   │   ├── candidates.py      ← Candidate CRUD + Drive sync
│   │   ├── jobs.py            ← JD upload + AI skill extraction
│   │   └── matching.py        ← AI Matching Engine endpoints
│   └── services/
│       ├── ai_service.py      ← Anthropic Claude API calls
│       └── google_drive_service.py ← Drive file sync
│
└── frontend/                  ← React + TypeScript + Tailwind
    ├── src/
    │   ├── main.tsx            ← React entry point
    │   ├── App.tsx             ← Routing
    │   ├── index.css           ← Tailwind + global styles
    │   ├── types.ts            ← TypeScript interfaces
    │   ├── context/
    │   │   └── AuthContext.tsx ← Global auth state
    │   ├── services/
    │   │   └── api.ts          ← Axios client + all API calls
    │   ├── pages/
    │   │   ├── LoginPage.tsx
    │   │   ├── AuthCallbackPage.tsx
    │   │   ├── DashboardPage.tsx
    │   │   ├── CandidatesPage.tsx
    │   │   ├── JobsPage.tsx
    │   │   ├── MatchingPage.tsx
    │   │   └── ResultsPage.tsx
    │   └── components/
    │       ├── Layout.tsx          ← Sidebar + topbar shell
    │       ├── MatchResultCard.tsx ← Match result with questions
    │       ├── AddCandidateModal.tsx
    │       └── SkillBadge.tsx
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.js
    └── tsconfig.json
```

---

## ⚙️ Prerequisites

| Tool | Version |
|------|---------|
| Python | 3.11+ |
| Node.js | 18+ |
| PostgreSQL | 14+ |
| Google Cloud Project | (for OAuth) |
| Anthropic API Key | (Claude access) |

---

## 🗄️ Database Setup (PostgreSQL)

```bash
# Option A: local PostgreSQL
psql -U postgres
CREATE DATABASE skillify_db;
\q

# Option B: Docker (quick)
docker run -d \
  --name skillify-pg \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=skillify_db \
  -p 5432:5432 \
  postgres:16
```

---

## 🔑 Environment Variables

```bash
# 1. Copy the example file
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/skillify_db

# Google OAuth
# → https://console.cloud.google.com/ → APIs & Services → Credentials
# → Create OAuth 2.0 Client ID (Web application)
# → Add redirect URI: http://localhost:8000/auth/google/callback
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback

# Anthropic Claude API
# → https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-...

# JWT (generate with: python -c "import secrets; print(secrets.token_hex(32))")
SECRET_KEY=your-random-64-char-hex-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# Frontend URL (for OAuth redirect after login)
FRONTEND_URL=http://localhost:5173
```

Also create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000
```

---

## 🐍 Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# 🌱 Seed the database with test data (10 candidates + 4 JDs)
python seed_data.py

# Start the FastAPI server
uvicorn main:app --reload --port 8000
```

API is now live at → http://localhost:8000  
Swagger docs → http://localhost:8000/docs

---

## ⚛️ Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

Frontend is now live at → http://localhost:5173

---

## 🌱 Seed Data (Test Data Overview)

Running `python seed_data.py` creates:

### 👤 Demo User
| Email | Role |
|-------|------|
| recruiter@skillify.demo | Recruiter (Google OAuth simulated) |

### 👥 10 Candidate Profiles
| Name | Role | Experience | Key Skills |
|------|------|-----------|------------|
| Arjun Mehta | Senior Python Developer | 6 yrs | Python, FastAPI, PostgreSQL, AWS |
| Sneha Reddy | Full Stack Developer | 4 yrs | React, Node.js, TypeScript, MongoDB |
| Ravi Kumar | DevOps Engineer | 5 yrs | Kubernetes, Docker, AWS, Terraform |
| Anjali Patel | Data Scientist | 3 yrs | Python, TensorFlow, PyTorch, ML |
| Mohammed Faraz | Backend Developer | 2 yrs | Python, Flask, MySQL |
| Kavitha Nair | React Developer | 3 yrs | React, TypeScript, Redux, Tailwind |
| Suresh Babu | Java Backend Developer | 7 yrs | Java, Spring Boot, Kafka, Microservices |
| Deepika Ramesh | Cloud Architect | 8 yrs | AWS, Azure, Terraform, Kubernetes |
| Vikram Singh | AI/ML Engineer | 5 yrs | Python, LangChain, RAG, OpenAI API |
| Pooja Iyer | QA / SDET Engineer | 4 yrs | Selenium, Pytest, JMeter, CI/CD |

### 📄 4 Job Descriptions (pre-seeded for demo matching)
1. Senior Python Backend Developer – FinTech
2. Full Stack React + Node.js Developer – SaaS Startup
3. AI/ML Engineer – LLM Applications
4. DevOps / Cloud Engineer

---

## 🤖 How the AI Matching Works

```
User uploads JD
      ↓
Claude AI parses JD → extracts required_skills, experience range
      ↓
For each candidate in DB:
  Claude AI compares resume + skills vs JD
  → match_score (0–100)
  → matched_skills (present in both)
  → missing_skills (in JD, not in candidate)
  → ai_summary (2–3 sentence explanation)
      ↓
For top-N matches:
  Claude AI generates 8 interview questions
  (Technical, Gap, Behavioural, Situational)
      ↓
Results sorted by score → returned to frontend
```

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/google/login` | Redirect to Google OAuth |
| GET | `/auth/google/callback` | Handle OAuth callback |
| GET | `/auth/me` | Get current user |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/candidates/` | List all candidates |
| GET | `/candidates/{id}` | Get one candidate |
| POST | `/candidates/` | Create candidate manually |
| PUT | `/candidates/{id}` | Update candidate |
| DELETE | `/candidates/{id}` | Soft-delete candidate |
| POST | `/candidates/sync-drive` | Sync from Google Drive |

### Job Descriptions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/jobs/` | List all JDs |
| GET | `/jobs/{id}` | Get one JD |
| POST | `/jobs/` | Create JD from text |
| POST | `/jobs/upload-file` | Upload PDF/DOCX JD |
| DELETE | `/jobs/{id}` | Delete JD |

### AI Matching Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/matching/run` | Run AI matching |
| GET | `/matching/results/{job_id}` | Fetch cached results |
| POST | `/matching/interview/{match_id}` | Regenerate questions |
| GET | `/matching/summary/{job_id}` | AI executive summary |

---

## 🔄 Typical User Flow

```
1. Open http://localhost:5173
2. Click "Sign in with Google"
3. (Dev tip: seed data creates candidates automatically)
4. Go to "Job Descriptions" → Upload JD or paste text
5. Go to "AI Matching" → Select JD → Click "Run Matching"
6. View scores, skill gaps, and interview questions
7. Click "Full Report" for the complete results page
```

---

## 🛠️ Development Tips

### Skip Google OAuth in development
If you don't have Google OAuth set up yet, you can test the API directly:

```bash
# Get a test JWT by hitting the debug endpoint (add this to auth.py temporarily)
# Then use it in Authorization: Bearer <token> header
```

### Re-run seed data
```bash
# Safe to re-run – skips existing rows
python seed_data.py
```

### View all API docs
```
http://localhost:8000/docs       ← Swagger UI (interactive)
http://localhost:8000/redoc      ← ReDoc (cleaner read)
```

---

## 🚧 Known Limitations / TODO

- [ ] Real Google Drive sync requires valid OAuth token with Drive scope
- [ ] Matching is synchronous – for 100+ candidates, add Celery task queue
- [ ] No resume file storage (stored as text only in DB)
- [ ] Add Alembic migrations for production schema changes
- [ ] Add rate limiting on AI endpoints

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS |
| State | TanStack Query (React Query) |
| HTTP | Axios |
| Backend | FastAPI + Python 3.11 |
| Database | PostgreSQL + SQLAlchemy |
| AI Engine | Anthropic Claude (claude-sonnet-4) |
| Auth | Google OAuth 2.0 + JWT |
| Drive | Google Drive API v3 |

---

## 👥 Team Handoff Notes

1. **Each team member** needs their own `.env` file (not committed to git)
2. **Seed data** is safe to run on any fresh DB – use `python seed_data.py`
3. **Anthropic API key** is shared via your team's secret manager
4. **Google OAuth** – only the configured redirect URIs work; add `localhost:8000/auth/google/callback` in Google Console
5. **DB migrations** – after any `models.py` change, drop & recreate tables in dev (`Base.metadata.drop_all` then `create_all`), use Alembic in prod
