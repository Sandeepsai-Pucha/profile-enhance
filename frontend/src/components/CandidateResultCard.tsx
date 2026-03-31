// src/components/CandidateResultCard.tsx
// ─────────────────────────────────────
// Rich card for one pipeline result: score, skills, AI summary,
// improvement suggestions, and interview questions.

import { useState } from 'react'
import {
  ChevronDown, ChevronUp, ExternalLink, User,
  CheckCircle, XCircle, Sparkles, MessageSquare, Lightbulb,
  Briefcase, GraduationCap, Clock, CalendarPlus,
} from 'lucide-react'
import type { CandidateMatchResult, InterviewQuestion } from '../types'
import ScheduleInterviewModal from './ScheduleInterviewModal'

// ── Score ring ────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 80 ? 'text-green-600'  :
    score >= 60 ? 'text-amber-500'  :
                  'text-red-500'

  const ring =
    score >= 80 ? 'border-green-400' :
    score >= 60 ? 'border-amber-400' :
                  'border-red-400'

  return (
    <div className={`w-16 h-16 rounded-full border-4 ${ring} flex flex-col items-center justify-center shrink-0`}>
      <span className={`text-xl font-black ${color}`}>{score.toFixed(0)}</span>
      <span className="text-slate-400 text-[9px] font-semibold">/ 100</span>
    </div>
  )
}

// ── Difficulty badge ──────────────────────────────────────────
const DIFF_COLOR: Record<string, string> = {
  Easy:   'bg-green-100 text-green-700',
  Medium: 'bg-amber-100 text-amber-700',
  Hard:   'bg-red-100  text-red-700',
}
const CAT_COLOR: Record<string, string> = {
  Technical:   'bg-sky-100 text-blue-900',
  Gap:         'bg-orange-100 text-orange-700',
  Behavioural: 'bg-violet-100 text-violet-700',
  Situational: 'bg-teal-100   text-teal-700',
}

function QuestionItem({ q }: { q: InterviewQuestion }) {
  return (
    <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${CAT_COLOR[q.category] ?? 'bg-slate-100 text-slate-600'}`}>
          {q.category}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${DIFF_COLOR[q.difficulty] ?? 'bg-slate-100 text-slate-600'}`}>
          {q.difficulty}
        </span>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed">{q.question}</p>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────
export default function CandidateResultCard({
  result,
  rank,
  jdTitle = '',
}: {
  result:   CandidateMatchResult
  rank:     number
  jdTitle?: string
}) {
  const [open, setOpen] = useState(rank === 1) // auto-open top candidate
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const resume = result.parsed_resume

  const expColor =
    result.experience_match === 'Good fit'       ? 'text-green-600 bg-green-50'  :
    result.experience_match === 'Over-qualified' ? 'text-sky-500 bg-sky-50' :
                                                   'text-amber-600 bg-amber-50'

  return (
    <div className={`bg-white border rounded-2xl shadow-sm transition-shadow hover:shadow-md
                     ${rank === 1 ? 'border-green-300' : 'border-slate-200'}`}>

      {/* ── Collapsed header ─────────────────────────────────── */}
      <div className="p-5">
        <div className="flex items-center gap-4">

          {/* Rank badge */}
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black shrink-0
                           ${rank === 1 ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
            #{rank}
          </div>

          {/* Score ring */}
          <ScoreRing score={result.match_score} />

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-800 text-base">{resume.name}</h3>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${expColor}`}>
                {result.experience_match}
              </span>
              {rank === 1 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  ⭐ Top Match
                </span>
              )}
            </div>
            {resume.current_role && (
              <p className="text-sm text-slate-500 mt-0.5">{resume.current_role}</p>
            )}

            {/* Matched skills preview */}
            <div className="flex flex-wrap gap-1 mt-2">
              {result.matched_skills.slice(0, 5).map((s) => (
                <span key={s} className="text-[11px] bg-green-50 text-green-700 border border-green-200
                                         px-2 py-0.5 rounded-full font-medium">
                  ✓ {s}
                </span>
              ))}
              {result.matched_skills.length > 5 && (
                <span className="text-[11px] text-slate-400">+{result.matched_skills.length - 5} more</span>
              )}
            </div>
          </div>

          {/* Drive link + schedule button + toggle */}
          <div className="flex items-center gap-2 shrink-0">
            {result.drive_file_url && (
              <a href={result.drive_file_url} target="_blank" rel="noopener noreferrer"
                className="p-2 text-slate-400 hover:text-sky-500 transition-colors" title="Open in Drive">
                <ExternalLink size={16} />
              </a>
            )}
            <button
              onClick={() => setScheduleOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-400 hover:bg-cyan-300
                         text-slate-900 rounded-lg text-xs font-semibold transition-colors"
              title="Schedule Interview"
            >
              <CalendarPlus size={13} /> Schedule
            </button>
            <button onClick={() => setOpen(!open)}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg
                         text-xs text-slate-600 hover:bg-slate-50 transition-colors">
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {open ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {/* AI summary — always visible */}
        <p className="mt-3 text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-2.5 italic leading-relaxed">
          {result.ai_summary}
        </p>
      </div>

      {/* ── Expanded detail ───────────────────────────────────── */}
      {open && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">

          {/* Resume details */}
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Experience</p>
              <p className="text-sm text-slate-700 flex items-center gap-1.5">
                <Clock size={13} className="text-slate-400" />
                {resume.experience_years} year{resume.experience_years !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Education</p>
              <p className="text-sm text-slate-700 flex items-center gap-1.5">
                <GraduationCap size={13} className="text-slate-400" />
                {resume.education || 'Not specified'}
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contact</p>
              <p className="text-sm text-slate-700 truncate">{resume.email || 'Not found'}</p>
              {resume.phone && <p className="text-sm text-slate-500">{resume.phone}</p>}
            </div>
          </div>

          {/* Skills grid */}
          <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Matched */}
            <div>
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle size={12} /> Matched Skills ({result.matched_skills.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.matched_skills.map((s) => (
                  <span key={s} className="text-xs bg-green-50 text-green-700 border border-green-200
                                           px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
            {/* Missing */}
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <XCircle size={12} /> Missing Skills ({result.missing_skills.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.missing_skills.map((s) => (
                  <span key={s} className="text-xs bg-red-50 text-red-600 border border-red-200
                                           px-2 py-0.5 rounded-full">{s}</span>
                ))}
                {result.missing_skills.length === 0 && (
                  <span className="text-xs text-slate-400">None — great fit!</span>
                )}
              </div>
            </div>
            {/* Extra */}
            {result.extra_skills.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Sparkles size={12} /> Bonus Skills ({result.extra_skills.length})
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.extra_skills.map((s) => (
                    <span key={s} className="text-xs bg-sky-50 text-sky-600 border border-sky-200
                                             px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Work history */}
          {resume.work_history.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Briefcase size={12} /> Work History
              </p>
              <div className="space-y-3">
                {resume.work_history.slice(0, 3).map((wh, i) => (
                  <div key={i} className="pl-3 border-l-2 border-slate-200">
                    <p className="font-semibold text-slate-700 text-sm">{wh.title}</p>
                    <p className="text-xs text-slate-500">{wh.company} · {wh.duration}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Improvement suggestions */}
          {result.improvement_suggestions.length > 0 && (
            <div className="px-5 py-4 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-1">
                <Lightbulb size={12} /> Resume Improvement Suggestions
              </p>
              <ol className="space-y-2">
                {result.improvement_suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-amber-900">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-200 text-amber-800
                                     text-xs font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Interview questions */}
          {result.interview_questions.length > 0 && (
            <div className="px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1">
                <MessageSquare size={12} /> Interview Questions ({result.interview_questions.length})
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {result.interview_questions.map((q, i) => (
                  <QuestionItem key={i} q={q} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {scheduleOpen && (
        <ScheduleInterviewModal
          candidate={result}
          jdTitle={jdTitle}
          onClose={() => setScheduleOpen(false)}
        />
      )}
    </div>
  )
}
