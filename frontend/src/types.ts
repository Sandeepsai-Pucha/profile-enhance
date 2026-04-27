// src/types.ts
// ─────────────
// TypeScript interfaces mirroring backend Pydantic schemas.

export interface User {
  id: number;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

// ── Job Description (persisted) ───────────────────────────────
export interface JobDescription {
  id: number;
  title: string;
  company: string | null;
  jd_text: string;
  required_skills: string[];
  nice_to_have_skills: string[];
  experience_min: number;
  experience_max: number;
  education_required: string | null;
  employment_type: string | null;
  location: string | null;
  responsibilities: string[];
  benefits: string[];
  salary_range: string | null;
  jd_summary: string | null;
  uploaded_by: number | null;
  created_at: string;
}

// ── Pipeline (all ephemeral) ──────────────────────────────────
export interface WorkHistoryItem {
  title: string | null;
  company: string | null;
  duration: string | null;
  responsibilities: string[];
}

export interface ParsedResume {
  name: string;
  email: string | null;
  phone: string | null;
  current_role: string | null;
  experience_years: number;
  skills: string[];
  education: string | null;
  certifications: string[];
  work_history: WorkHistoryItem[];
  summary: string | null;
}

export interface InterviewQuestion {
  question: string;
  category: "Technical" | "Gap" | "Behavioural" | "Situational";
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface CandidateMatchResult {
  file_name: string;
  drive_file_id: string;
  drive_file_url: string;
  parsed_resume: ParsedResume;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  extra_skills: string[];
  experience_match: "Under-qualified" | "Good fit" | "Over-qualified";
  ai_summary: string;
  improvement_suggestions: string[];
  interview_questions: InterviewQuestion[];
}

export interface PipelineStats {
  total_files_found: number;
  total_parsed: number;
  total_above_threshold: number;
  processing_time_secs: number;
}

export type Stream = "Salesforce" | "Digital" | "QA";
export const ALL_STREAMS: Stream[] = ["Salesforce", "Digital", "QA"];

export interface PipelineRequest {
  jd_id: number;
  drive_folder_id?: string;
  top_n?: number;
  min_score?: number;
  streams?: Stream[]; // filter candidates by stream(s); empty = all
}

export interface PipelineResponse {
  jd: JobDescription;
  top_candidates: CandidateMatchResult[];
  executive_summary: string;
  stats: PipelineStats;
  errors: string[];
}

// ── Indexing (CandidateProfile) ───────────────────────────────
export interface CandidateProfileOut {
  id: number;
  source_file_id: string;
  file_name: string;
  candidate_name: string | null;
  current_role: string | null;
  experience_years: number;
  skills: string[];
  stream: Stream | null;
  indexed_at: string | null;
}

export interface IndexingRequest {
  streams?: Stream[]; // streams to index from Drive; empty = local only
}

export interface IndexingResult {
  total: number;
  indexed: number;
  skipped: number;
  updated: number;
  errors: string[];
}

export interface IndexingStatusOut {
  total_indexed: number;
  profiles: CandidateProfileOut[];
}

export interface ResumeFileOut {
  filename: string;
  file_size_kb: number;
  uploaded_at: string;
  is_indexed: boolean;
  candidate_name: string | null;
}

export interface ResumesListOut {
  total_files: number;
  indexed_count: number;
  pending_count: number;
  files: ResumeFileOut[];
}

// ── Email Report ──────────────────────────────────────────────
export interface SendReportRequest {
  to_email: string;
  candidate_name: string;
  jd_title: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  improvement_suggestions: string[];
  interview_date: string; // "YYYY-MM-DD"
  custom_message?: string;
}

export interface SendReportResponse {
  message: string;
  message_id: string;
}

// ── Interview Scheduling ──────────────────────────────────────
export interface Interviewer {
  name: string;
  email: string;
  available_from: string; // "09:00"
  available_to: string; // "17:00"
}

export interface ScheduleInterviewRequest {
  candidate_name: string;
  candidate_email: string | null;
  interviewer_email: string;
  jd_title: string;
  resume_url: string;
  ai_summary: string;
  start_datetime: string; // ISO 8601
  end_datetime: string; // ISO 8601
  timezone?: string;
}

export interface ScheduleInterviewResponse {
  event_id: string;
  event_link: string;
  message: string;
}
