// src/pages/ResultsPage.tsx
// ──────────────────────────
// Dedicated results screen after pipeline run.
// Split layout: Left = resume details | Right = suggestions + questions.
// Candidate selector tabs at top.

import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Users, FileText, BarChart3, Clock, Briefcase,
  GraduationCap, Mail, Phone, CheckCircle, XCircle,
  Sparkles, Lightbulb, ExternalLink, CalendarPlus, Cpu, Download,
} from 'lucide-react'
import type { PipelineResponse, CandidateMatchResult } from '../types'
import BackButton from '../components/BackButton'
import InterviewQuestionsPanel from '../components/InterviewQuestionsPanel'
import { downloadCandidatePDF } from '../utils/downloadPDF'

// ── Score ring ────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-600' : score >= 60 ? 'text-amber-500' : 'text-red-500'
  const border = score >= 80 ? 'border-green-400' : score >= 60 ? 'border-amber-400' : 'border-red-400'
  return (
    <div className={`w-16 h-16 rounded-full border-4 ${border} flex flex-col items-center justify-center shrink-0`}>
      <span className={`text-xl font-black ${color}`}>{score.toFixed(0)}</span>
      <span className="text-slate-400 text-[9px] font-semibold">/ 100</span>
    </div>
  )
}

// ── Resume panel (left) ───────────────────────────────────────
function ResumePanel({ candidate }: { candidate: CandidateMatchResult }) {
  const r = candidate.parsed_resume
  const expColor =
    candidate.experience_match === 'Good fit' ? 'bg-green-100 text-green-700' :
      candidate.experience_match === 'Over-qualified' ? 'bg-sky-100 text-sky-700' :
        'bg-amber-100 text-amber-700'
  return (
    <div className="space-y-4">

      {/* Name + score */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <ScoreRing score={candidate.match_score} />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-slate-800 truncate">{r.name}</h3>
            {r.current_role && <p className="text-sm text-slate-500 mt-0.5 truncate">{r.current_role}</p>}
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${expColor}`}>
                {candidate.experience_match}
              </span>
            </div>
          </div>
          {candidate.drive_file_url && (
            <a href={candidate.drive_file_url} target="_blank" rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-sky-500 transition-colors shrink-0"
              title="Open resume in Drive">
              <ExternalLink size={16} />
            </a>
          )}
        </div>
        <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-2.5 italic leading-relaxed">
          {candidate.ai_summary}
        </p>
      </div>

      {/* Contact & details */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Details</p>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-sm text-slate-700">
            <Clock size={14} className="text-slate-400 shrink-0" />
            {r.experience_years} year{r.experience_years !== 1 ? 's' : ''} experience
          </div>
          {r.education && (
            <div className="flex items-start gap-2.5 text-sm text-slate-700">
              <GraduationCap size={14} className="text-slate-400 shrink-0 mt-0.5" />
              <span>{r.education}</span>
            </div>
          )}
          {r.email && (
            <div className="flex items-center gap-2.5 text-sm text-slate-700">
              <Mail size={14} className="text-slate-400 shrink-0" />
              <span className="truncate">{r.email}</span>
            </div>
          )}
          {r.phone && (
            <div className="flex items-center gap-2.5 text-sm text-slate-700">
              <Phone size={14} className="text-slate-400 shrink-0" />
              {r.phone}
            </div>
          )}
        </div>
        {r.certifications.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Certifications</p>
            <div className="flex flex-wrap gap-1">
              {r.certifications.map((c, i) => (
                <span key={i} className="text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full">{c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Skills */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Skills</p>
        <div>
          <p className="text-xs font-semibold text-green-600 mb-2 flex items-center gap-1">
            <CheckCircle size={11} /> Matched ({candidate.matched_skills.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {candidate.matched_skills.map(s => (
              <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
        {candidate.missing_skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-red-500 mb-2 flex items-center gap-1">
              <XCircle size={11} /> Missing ({candidate.missing_skills.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {candidate.missing_skills.map(s => (
                <span key={s} className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}
        {candidate.extra_skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-sky-500 mb-2 flex items-center gap-1">
              <Sparkles size={11} /> Bonus ({candidate.extra_skills.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {candidate.extra_skills.map(s => (
                <span key={s} className="text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded-full">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Work history */}
      {r.work_history.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1">
            <Briefcase size={12} /> Work History
          </p>
          <div className="space-y-4">
            {r.work_history.map((wh, i) => (
              <div key={i} className="pl-3 border-l-2 border-slate-200">
                <p className="font-semibold text-slate-700 text-sm">{wh.title}</p>
                <p className="text-xs text-slate-500">{wh.company} · {wh.duration}</p>
                {wh.responsibilities.slice(0, 2).map((resp, j) => (
                  <p key={j} className="text-xs text-slate-400 mt-0.5">• {resp}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Professional summary */}
      {r.summary && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Professional Summary</p>
          <p className="text-sm text-slate-600 leading-relaxed">{r.summary}</p>
        </div>
      )}
    </div>
  )
}

// ── Right panel — suggestions + questions ─────────────────────
function RightPanel({ candidate, jdTitle }: { candidate: CandidateMatchResult; jdTitle: string }) {
  const [scheduleOpen, setScheduleOpen] = useState(false)

  return (
    <div className="space-y-4">

      {/* Action buttons */}
      <div className="flex justify-end gap-2 flex-wrap">
        <button
          onClick={() => downloadCandidatePDF(candidate, jdTitle)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 hover:bg-blue-950
                     text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <Download size={15} /> Download Candidate Report
        </button>
        <button
          onClick={() => setScheduleOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-400 hover:bg-cyan-300
                     text-slate-900 rounded-xl text-sm font-semibold transition-colors shadow-sm"
        >
          <CalendarPlus size={15} /> Schedule Interview
        </button>
      </div>

      {/* Improvement suggestions */}
      {candidate.improvement_suggestions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Lightbulb size={13} /> Resume Improvement Suggestions
          </p>
          <ol className="space-y-3">
            {candidate.improvement_suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-amber-900">
                <span className="shrink-0 w-6 h-6 rounded-full bg-amber-200 text-amber-800
                                 text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Interview questions accordion */}
      <InterviewQuestionsPanel
        questions={candidate.interview_questions}
        candidateName={candidate.parsed_resume.name}
      />

      {/* {scheduleOpen && (
        <ScheduleInterviewModal
          candidate={candidate}
          jdTitle={jdTitle}
          onClose={() => setScheduleOpen(false)}
        />
      )} */}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function ResultsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const pipelineResult = location.state?.result as PipelineResponse | undefined
  const [selectedIdx, setSelectedIdx] = useState(0)

  if (!pipelineResult || pipelineResult.top_candidates.length === 0) {
    return (
      <div className="text-center py-24 space-y-4">
        <Cpu size={48} className="mx-auto text-slate-200" />
        <h2 className="text-xl font-bold text-slate-700">No results to display</h2>
        <p className="text-slate-400 text-sm">Run the pipeline first to see candidate results.</p>
        <button
          onClick={() => navigate('/app/pipeline')}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white
                     rounded-xl text-sm font-semibold hover:bg-blue-950 transition-colors"
        >
          <Cpu size={15} /> Go to Pipeline
        </button>
      </div>
    )
  }

  const candidate = pipelineResult.top_candidates[selectedIdx]

  return (
    <div className="space-y-5">
      <BackButton to="/app/pipeline" label="Back to Pipeline" />

      {/* Header + stats */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Pipeline Results</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {pipelineResult.jd.title}
            {pipelineResult.jd.company ? ` @ ${pipelineResult.jd.company}` : ''}
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {[
            { icon: FileText, label: 'Files', value: pipelineResult.stats.total_files_found },
            { icon: Users, label: 'Parsed', value: pipelineResult.stats.total_parsed },
            { icon: BarChart3, label: 'Matched', value: pipelineResult.stats.total_above_threshold },
            { icon: Clock, label: 'Secs', value: pipelineResult.stats.processing_time_secs.toFixed(1) },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-center min-w-[62px] shadow-sm">
              <Icon size={14} className="mx-auto text-sky-500 mb-0.5" />
              <p className="text-base font-black text-slate-800">{value}</p>
              <p className="text-[10px] text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Executive summary */}
      <div className="bg-gradient-to-r from-[#0F172A] to-blue-900 rounded-2xl px-5 py-4 text-white">
        <p className="text-xs font-semibold opacity-60 uppercase tracking-wide mb-1">AI Executive Summary</p>
        <p className="text-sm leading-relaxed">{pipelineResult.executive_summary}</p>
      </div>

      {/* Non-fatal errors */}
      {pipelineResult.errors.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-semibold text-amber-700 mb-1">
            {pipelineResult.errors.length} file(s) could not be processed
          </p>
          {pipelineResult.errors.map((e, i) => (
            <p key={i} className="text-xs text-amber-600">• {e}</p>
          ))}
        </div>
      )}

      {/* Candidate selector tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {pipelineResult.top_candidates.map((c, i) => {
          const scoreColor =
            c.match_score >= 80 ? 'bg-green-100 text-green-700' :
              c.match_score >= 60 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-600'
          const active = selectedIdx === i
          return (
            <button
              key={c.drive_file_id}
              onClick={() => setSelectedIdx(i)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium
                          whitespace-nowrap transition-all shrink-0
                          ${active
                  ? 'bg-blue-900 border-blue-900 text-white shadow-md'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-sky-400 hover:text-blue-900'}`}
            >
              <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center
                               ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {i + 1}
              </span>
              <span className="max-w-[120px] truncate">{c.parsed_resume.name}</span>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full
                               ${active ? 'bg-white/20 text-white' : scoreColor}`}>
                {c.match_score.toFixed(0)}%
              </span>
              {i === 0 && <span className={`text-xs ${active ? 'opacity-70' : 'text-amber-500'}`}>⭐</span>}
            </button>
          )
        })}
      </div>

      {/* Split view */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-5 items-start">

        {/* Left — Resume (2/5) */}
        <div className="xl:col-span-2">
          <ResumePanel candidate={candidate} />
        </div>

        {/* Right — Suggestions + Questions (3/5) */}
        <div className="xl:col-span-3">
          <RightPanel candidate={candidate} jdTitle={pipelineResult.jd.title} />
        </div>
      </div>
    </div>
  )
}
