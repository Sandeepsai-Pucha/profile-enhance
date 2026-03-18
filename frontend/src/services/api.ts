// src/services/api.ts
// ────────────────────
// Central Axios instance.
// Automatically attaches the JWT from localStorage to every request.
// On 401 → clears token and reloads so the login screen appears.

import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Create the Axios instance ──────────────────────────────────
const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,   // 30s — AI calls can be slow
})

// ── Request interceptor: inject Bearer token ───────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('skillify_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

// ── Response interceptor: handle 401 globally ─────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid → force re-login
      localStorage.removeItem('skillify_token')
      window.location.href = '/'
    }
    return Promise.reject(error)
  },
)

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

/** Get the Google OAuth login URL to redirect the user to. */
export const getGoogleLoginUrl = () => `${BASE_URL}/auth/google/login`

/** Fetch the currently logged-in user's profile. */
export const fetchCurrentUser = () => api.get('/auth/me').then((r) => r.data)


// ══════════════════════════════════════════════════════════════
//  CANDIDATES
// ══════════════════════════════════════════════════════════════

export const fetchCandidates = (params?: Record<string, unknown>) =>
  api.get('/candidates/', { params }).then((r) => r.data)

export const fetchCandidate = (id: number) =>
  api.get(`/candidates/${id}`).then((r) => r.data)

export const createCandidate = (data: Record<string, unknown>) =>
  api.post('/candidates/', data).then((r) => r.data)

export const updateCandidate = (id: number, data: Record<string, unknown>) =>
  api.put(`/candidates/${id}`, data).then((r) => r.data)

export const deleteCandidate = (id: number) =>
  api.delete(`/candidates/${id}`)

/** Trigger Google Drive sync for the logged-in user. */
export const syncFromDrive = (folderId?: string) =>
  api.post('/candidates/sync-drive', null, {
    params: folderId ? { folder_id: folderId } : {},
  }).then((r) => r.data)


// ══════════════════════════════════════════════════════════════
//  JOB DESCRIPTIONS
// ══════════════════════════════════════════════════════════════

export const fetchJDs = () =>
  api.get('/jobs/').then((r) => r.data)

export const fetchJD = (id: number) =>
  api.get(`/jobs/${id}`).then((r) => r.data)

export const createJD = (data: { title: string; company?: string; jd_text: string }) =>
  api.post('/jobs/', data).then((r) => r.data)

/**
 * Upload a JD as a PDF/DOCX/TXT file.
 * Uses FormData so the file is sent as multipart/form-data.
 */
export const uploadJDFile = (file: File, title: string, company?: string) => {
  const form = new FormData()
  form.append('file', file)
  form.append('title', title)
  if (company) form.append('company', company)
  return api.post('/jobs/upload-file', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data)
}

export const deleteJD = (id: number) =>
  api.delete(`/jobs/${id}`)


// ══════════════════════════════════════════════════════════════
//  MATCHING ENGINE
// ══════════════════════════════════════════════════════════════

/** Run the AI matching engine for a given JD. */
export const runMatching = (jobId: number, topN = 5) =>
  api.post('/matching/run', { job_id: jobId, top_n: topN }).then((r) => r.data)

/** Fetch cached match results for a JD (no AI call). */
export const fetchMatchResults = (jobId: number) =>
  api.get(`/matching/results/${jobId}`).then((r) => r.data)

/** Regenerate interview questions for a specific match. */
export const regenerateQuestions = (matchId: number) =>
  api.post(`/matching/interview/${matchId}`).then((r) => r.data)

/** Get an AI executive summary for the top candidates of a JD. */
export const fetchExecutiveSummary = (jobId: number) =>
  api.get(`/matching/summary/${jobId}`).then((r) => r.data)

export default api
