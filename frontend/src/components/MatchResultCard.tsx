// src/components/MatchResultCard.tsx
// ────────────────────────────────────
// Expandable card showing one candidate's match result:
//   • Score badge + name
//   • Matched / missing skill chips
//   • AI summary
//   • Interview questions accordion

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  RefreshCw, MessageSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { regenerateQuestions } from '../services/api'
import type { MatchResult, InterviewQuestion } from '../types'
import SkillBadge from './SkillBadge'
import clsx from 'clsx'

interface Props {
  result: MatchResult
  rank: number
  defaultOpen?: boolean
}

export default function MatchResultCard({ result: r, rank, defaultOpen = false }: Props) {
  const qc             = useQueryClient()
  const [open, setOpen] = useState(defaultOpen)

  // ── Colour the score badge by tier ───────────────────────────
  const scoreColor =
    r.match_score >= 70 ? 'bg-green-100 text-green-800 border-green-300'
  : r.match_score >= 45 ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
  :                        'bg-red-100 text-red-800 border-red-300'

  // ── Regenerate interview questions ────────────────────────────
  const regenMutation = useMutation({
    mutationFn: () => regenerateQuestions(r.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['match-results', r.job_id] })
      toast.success('Fresh interview questions generated!')
    },
    onError: () => toast.error('Failed to regenerate questions'),
  })

  return (
    <div className="card hover:shadow-md transition-shadow">

      {/* ── Top row ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {/* Rank badge */}
          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center
                          text-xs font-black text-slate-500 shrink-0">
            #{rank}
          </div>

          {/* Candidate avatar + name */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center
                            text-blue-800 font-bold text-sm shrink-0">
              {r.candidate.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-slate-800">{r.candidate.name}</p>
              <p className="text-xs text-slate-400">
                {r.candidate.current_role ?? 'Role not specified'} ·
                {r.candidate.experience_years} yrs exp
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Match score */}
          <div className={`border rounded-xl px-4 py-1.5 text-center font-black text-lg ${scoreColor}`}>
            {r.match_score.toFixed(0)}%
          </div>
          {/* Expand toggle */}
          <button
            onClick={() => setOpen(!open)}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* ── Expandable detail ────────────────────────────────────── */}
      {open && (
        <div className="mt-5 space-y-5 border-t border-slate-100 pt-5">

          {/* AI summary */}
          {r.ai_summary && (
            <div className="bg-blue-50 rounded-xl p-4 text-sm text-slate-700 leading-relaxed">
              <p className="text-xs font-semibold text-blue-600 mb-1 uppercase tracking-wide">AI Summary</p>
              {r.ai_summary}
            </div>
          )}

          {/* Skills grid */}
          <div className="grid grid-cols-2 gap-4">
            {/* Matched skills */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-green-700 uppercase tracking-wide">
                <CheckCircle2 size={13} /> Matched Skills ({r.matched_skills.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.matched_skills.length === 0 ? (
                  <span className="text-xs text-slate-400">None</span>
                ) : (
                  r.matched_skills.map((s) => (
                    <SkillBadge key={s} skill={s} variant="matched" />
                  ))
                )}
              </div>
            </div>

            {/* Missing skills */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-red-600 uppercase tracking-wide">
                <XCircle size={13} /> Missing Skills ({r.missing_skills.length})
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.missing_skills.length === 0 ? (
                  <span className="text-xs text-slate-400">None 🎉</span>
                ) : (
                  r.missing_skills.map((s) => (
                    <SkillBadge key={s} skill={s} variant="missing" />
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Interview questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MessageSquare size={15} />
                Interview Questions ({r.interview_questions.length})
              </div>
              <button
                onClick={() => regenMutation.mutate()}
                disabled={regenMutation.isPending}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800
                           font-medium transition-colors"
              >
                <RefreshCw size={12} className={regenMutation.isPending ? 'animate-spin' : ''} />
                Regenerate
              </button>
            </div>

            <div className="space-y-3">
              {r.interview_questions.map((q: InterviewQuestion, idx: number) => (
                <QuestionRow key={idx} question={q} index={idx + 1} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-component: single interview question row ───────────────
function QuestionRow({ question: q, index }: { question: InterviewQuestion; index: number }) {
  const catColor: Record<string, string> = {
    Technical:   'bg-blue-100 text-blue-800',
    Gap:         'bg-orange-100 text-orange-800',
    Behavioural: 'bg-purple-100 text-purple-800',
    Situational: 'bg-teal-100 text-teal-800',
  }
  const diffColor: Record<string, string> = {
    Easy:   'text-green-600',
    Medium: 'text-yellow-600',
    Hard:   'text-red-600',
  }

  return (
    <div className="flex gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
      <span className="text-xs font-bold text-slate-400 mt-0.5 w-5 shrink-0">{index}.</span>
      <div className="flex-1">
        <p className="text-sm text-slate-700 leading-snug mb-2">{q.question}</p>
        <div className="flex items-center gap-2">
          <span className={clsx('badge text-xs', catColor[q.category] ?? 'bg-slate-100 text-slate-600')}>
            {q.category}
          </span>
          <span className={clsx('text-xs font-semibold', diffColor[q.difficulty] ?? 'text-slate-500')}>
            {q.difficulty}
          </span>
        </div>
      </div>
    </div>
  )
}
