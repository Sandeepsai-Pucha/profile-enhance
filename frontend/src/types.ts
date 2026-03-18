// src/types.ts
// ─────────────
// Shared TypeScript interfaces mirroring the Pydantic schemas.

export interface User {
  id: number
  email: string
  name: string | null
  avatar_url: string | null
  created_at: string
}

export interface CandidateProfile {
  id: number
  name: string
  email: string
  phone: string | null
  current_role: string | null
  experience_years: number
  skills: string[]
  education: string | null
  summary: string | null
  resume_text: string | null
  drive_file_id: string | null
  drive_file_url: string | null
  is_active: boolean
  created_at: string
}

export interface JobDescription {
  id: number
  title: string
  company: string | null
  jd_text: string
  required_skills: string[]
  experience_min: number
  experience_max: number
  uploaded_by: number | null
  created_at: string
}

export interface InterviewQuestion {
  question: string
  category: 'Technical' | 'Gap' | 'Behavioural' | 'Situational'
  difficulty: 'Easy' | 'Medium' | 'Hard'
}

export interface MatchResult {
  id: number
  job_id: number
  candidate_id: number
  candidate: CandidateProfile
  match_score: number
  matched_skills: string[]
  missing_skills: string[]
  ai_summary: string | null
  interview_questions: InterviewQuestion[]
  created_at: string
}

export interface MatchResponse {
  job: JobDescription
  results: MatchResult[]
  total_candidates_evaluated: number
}

export interface SkillCategory {
  id: number
  category: string
  skills: string[]
  roles: string[]
}
