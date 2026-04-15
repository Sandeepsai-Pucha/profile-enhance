// src/services/api.ts
// ────────────────────
// Axios instance + all API call helpers.

import axios from "axios";
import type {
  PipelineRequest,
  PipelineResponse,
  Interviewer,
  ScheduleInterviewRequest,
  ScheduleInterviewResponse,
  SendReportRequest,
  SendReportResponse,
  IndexingResult,
  IndexingStatusOut,
  ResumesListOut,
} from "../types";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 600_000, // 10 min — Ollama on CPU can be slow with many resumes
});

// ── Inject Bearer token on every request ──────────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("skillify_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err),
);

// ── Global 401 handler ────────────────────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("skillify_token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  },
);

// ══════════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════════

export const getGoogleLoginUrl = (): string => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `http://localhost:8000/auth/google/callback`;
  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "select_account",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const fetchCurrentUser = () => api.get("/auth/me").then((r) => r.data);

export const fetchHome = () => api.get("/home").then((r) => r.data);

// ══════════════════════════════════════════════════════════════
//  JOB DESCRIPTIONS
// ══════════════════════════════════════════════════════════════

export const fetchJDs = () => api.get("/jobs/").then((r) => r.data);

export const fetchJD = (id: number) =>
  api.get(`/jobs/${id}`).then((r) => r.data);

export const createJD = (data: {
  title: string;
  company?: string;
  jd_text: string;
}) => api.post("/jobs/", data).then((r) => r.data);

export const uploadJDFile = (file: File, title: string, company?: string) => {
  const form = new FormData();
  form.append("file", file);
  form.append("title", title);
  if (company) form.append("company", company);
  return api
    .post("/jobs/upload-file", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then((r) => r.data);
};

export const deleteJD = (id: number) => api.delete(`/jobs/${id}`);

// ══════════════════════════════════════════════════════════════
//  PIPELINE
// ══════════════════════════════════════════════════════════════

/**
 * Run the full 9-step resume matching pipeline for a given JD.
 * Returns ranked candidates with scores, suggestions, and interview questions.
 */
export const runPipeline = (
  payload: PipelineRequest,
): Promise<PipelineResponse> =>
  api.post("/pipeline/run", payload).then((r) => r.data);

// ══════════════════════════════════════════════════════════════
//  EMAIL
// ══════════════════════════════════════════════════════════════

export const sendReportEmail = (
  payload: SendReportRequest,
): Promise<SendReportResponse> =>
  api.post("/email/send-report", payload).then((r) => r.data);
export const searchDriveFolders = (
  q: string,
): Promise<{ id: string; name: string }[]> =>
  api.get("/pipeline/folders", { params: { q } }).then((r) => r.data);

// ══════════════════════════════════════════════════════════════
//  INTERVIEW SCHEDULING
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
//  INDEXING
// ══════════════════════════════════════════════════════════════

export const uploadResumes = (files: File[]): Promise<{ saved: string[]; errors: string[]; message: string }> => {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  return api
    .post("/indexing/upload", form, { headers: { "Content-Type": "multipart/form-data" } })
    .then((r) => r.data);
};

export const fetchResumeFiles = (): Promise<ResumesListOut> =>
  api.get("/indexing/resumes").then((r) => r.data);

export const deleteResumeFile = (filename: string): Promise<{ message: string }> =>
  api.delete(`/indexing/resumes/${encodeURIComponent(filename)}`).then((r) => r.data);

export const runIndexing = (): Promise<IndexingResult> =>
  api.post("/indexing/run").then((r) => r.data);

export const reindexAll = (): Promise<IndexingResult> =>
  api.post("/indexing/reindex").then((r) => r.data);

export const fetchIndexingStatus = (): Promise<IndexingStatusOut> =>
  api.get("/indexing/status").then((r) => r.data);

export const resetIndexing = (): Promise<{ deleted: number; message: string }> =>
  api.delete("/indexing/reset").then((r) => r.data);

export const generateUpdatedResume = (
  source_file_id: string,
  skills_to_add: string[],
): Promise<Blob> =>
  api
    .post(
      "/pipeline/generate-resume",
      { source_file_id, skills_to_add },
      { responseType: "blob" },
    )
    .then((r) => r.data)
    .catch(async (err) => {
      // When responseType is "blob", error responses come back as Blobs too.
      // Parse them back to JSON so we can surface the real detail message.
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text()
        try {
          const json = JSON.parse(text)
          throw new Error(json.detail || text)
        } catch {
          throw new Error(text || `HTTP ${err.response.status}`)
        }
      }
      throw err
    });

// ══════════════════════════════════════════════════════════════
//  INTERVIEW SCHEDULING
// ══════════════════════════════════════════════════════════════

export const fetchInterviewers = (): Promise<Interviewer[]> =>
  api.get("/interviews/interviewers").then((r) => r.data);

export const scheduleInterview = (
  payload: ScheduleInterviewRequest,
): Promise<ScheduleInterviewResponse> =>
  api.post("/interviews/schedule", payload).then((r) => r.data);

export default api;
