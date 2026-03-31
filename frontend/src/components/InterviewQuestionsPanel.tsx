// src/components/InterviewQuestionsPanel.tsx
// ────────────────────────────────────────────
// Questions grouped by difficulty (Easy / Medium / Hard)
// with accordion, search, copy, download, and star features.

import { useState, useMemo } from 'react'
import {
  ChevronDown, ChevronRight, Search, Download, Copy,
  Star, MessageSquare, Check, X,
} from 'lucide-react'
import type { InterviewQuestion } from '../types'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const

const DIFF_CFG = {
  Easy:   { badge: 'bg-green-100 text-green-700', ring: 'border-green-200', bg: 'bg-green-50/50'  },
  Medium: { badge: 'bg-amber-100 text-amber-700', ring: 'border-amber-200', bg: 'bg-amber-50/50'  },
  Hard:   { badge: 'bg-red-100   text-red-700',   ring: 'border-red-200',   bg: 'bg-red-50/50'    },
}

const CAT_COLOR: Record<string, string> = {
  Technical:   'bg-sky-100 text-blue-900',
  Gap:         'bg-orange-100 text-orange-700',
  Behavioural: 'bg-violet-100 text-violet-700',
  Situational: 'bg-teal-100 text-teal-700',
}

export default function InterviewQuestionsPanel({
  questions,
  candidateName,
}: {
  questions:     InterviewQuestion[]
  candidateName: string
}) {
  const [search,     setSearch]     = useState('')
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})   // all collapsed by default
  const [starred,    setStarred]    = useState<Set<number>>(new Set())
  const [copied,     setCopied]     = useState<number | null>(null)   // -1 = "copy all"

  // ── filter ────────────────────────────────────────────────
  const filtered = useMemo(() =>
    questions.map((q, i) => ({ q, idx: i })).filter(
      ({ q }) => !search.trim() || q.question.toLowerCase().includes(search.toLowerCase())
    ),
    [questions, search]
  )

  const grouped = useMemo(() =>
    DIFFICULTIES
      .map(diff => ({ difficulty: diff, items: filtered.filter(({ q }) => q.difficulty === diff) }))
      .filter(g => g.items.length > 0),
    [filtered]
  )

  // ── actions ───────────────────────────────────────────────
  const toggleGroup = (diff: string) =>
    setOpenGroups(prev => ({ ...prev, [diff]: !prev[diff] }))

  const toggleStar = (idx: number) =>
    setStarred(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s })

  const flash = (key: number) => { setCopied(key); setTimeout(() => setCopied(null), 2000) }

  const copyOne = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => flash(idx))
  }

  const copyAll = () => {
    const lines: string[] = []
    DIFFICULTIES.forEach(diff => {
      const qs = questions.filter(q => q.difficulty === diff)
      if (!qs.length) return
      lines.push(`── ${diff} ──`)
      qs.forEach((q, i) => lines.push(`${i + 1}. ${q.question}`))
      lines.push('')
    })
    navigator.clipboard.writeText(lines.join('\n')).then(() => flash(-1))
  }

  const downloadTxt = () => {
    const lines: string[] = [`Interview Questions — ${candidateName}`, '='.repeat(50), '']
    DIFFICULTIES.forEach(diff => {
      const qs = questions.filter(q => q.difficulty === diff)
      if (!qs.length) return
      lines.push(`${diff.toUpperCase()} (${qs.length})`)
      lines.push('-'.repeat(30))
      qs.forEach((q, i) => lines.push(`${i + 1}. [${q.category}] ${q.question}`))
      lines.push('')
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `questions-${candidateName.replace(/\s+/g, '-').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── render ────────────────────────────────────────────────
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 flex-wrap justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare size={15} className="text-sky-500" />
          <span className="text-sm font-semibold text-slate-700">
            Interview Questions
            <span className="ml-1.5 text-xs font-normal text-slate-400">({questions.length})</span>
          </span>
          {starred.size > 0 && (
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              ⭐ {starred.size} starred
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAll}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg
                       text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {copied === -1
              ? <><Check size={12} className="text-green-500" /> Copied!</>
              : <><Copy size={12} /> Copy all</>}
          </button>
          <button
            onClick={downloadTxt}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg
                       text-xs text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download size={12} /> Download
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-5 py-3 border-b border-slate-100">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search questions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg pl-8 pr-8 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-sky-500 bg-slate-50"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {search && filtered.length === 0 && (
          <p className="text-xs text-slate-400 mt-1.5">No questions match "{search}"</p>
        )}
        {search && filtered.length > 0 && (
          <p className="text-xs text-slate-400 mt-1.5">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Accordion groups */}
      <div className="divide-y divide-slate-100">
        {grouped.length === 0 && (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            No questions available
          </div>
        )}

        {grouped.map(({ difficulty, items }) => {
          const cfg       = DIFF_CFG[difficulty]
          const isOpen    = !!openGroups[difficulty]
          const nStarred  = items.filter(({ idx }) => starred.has(idx)).length

          return (
            <div key={difficulty}>

              {/* Group header — click to toggle */}
              <button
                onClick={() => toggleGroup(difficulty)}
                className="w-full px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50
                           transition-colors text-left"
              >
                {isOpen
                  ? <ChevronDown  size={14} className="text-slate-400 shrink-0" />
                  : <ChevronRight size={14} className="text-slate-400 shrink-0" />}

                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cfg.badge}`}>
                  {difficulty}
                </span>

                <span className="text-sm text-slate-600">
                  {items.length} question{items.length !== 1 ? 's' : ''}
                </span>

                {nStarred > 0 && (
                  <span className="text-xs text-amber-500 font-semibold">⭐ {nStarred}</span>
                )}
              </button>

              {/* Questions list */}
              {isOpen && (
                <div className={`px-4 pb-4 pt-1 space-y-3 ${cfg.bg}`}>
                  {items.map(({ q, idx }, i) => (
                    <div key={idx}
                      className={`border ${cfg.ring} rounded-xl p-4 bg-white space-y-2.5 shadow-sm`}
                    >
                      {/* Question row */}
                      <div className="flex items-start gap-2.5">
                        {/* Number bubble */}
                        <span className={`shrink-0 w-6 h-6 rounded-full ${cfg.badge} text-xs
                                         font-bold flex items-center justify-center mt-0.5`}>
                          {i + 1}
                        </span>

                        {/* Text */}
                        <p className="text-sm text-slate-700 leading-relaxed flex-1">
                          {q.question}
                        </p>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <button
                            onClick={() => toggleStar(idx)}
                            title={starred.has(idx) ? 'Remove star' : 'Mark as important'}
                            className={`p-1.5 rounded-lg transition-colors
                              ${starred.has(idx)
                                ? 'text-amber-400 bg-amber-50'
                                : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'}`}
                          >
                            <Star size={13} fill={starred.has(idx) ? 'currentColor' : 'none'} />
                          </button>
                          <button
                            onClick={() => copyOne(q.question, idx)}
                            title="Copy question"
                            className="p-1.5 rounded-lg text-slate-300 hover:text-sky-500
                                       hover:bg-sky-50 transition-colors"
                          >
                            {copied === idx
                              ? <Check size={13} className="text-green-500" />
                              : <Copy  size={13} />}
                          </button>
                        </div>
                      </div>

                      {/* Category badge */}
                      <span className={`inline-block text-[10px] font-semibold px-2 py-0.5
                                        rounded-full ${CAT_COLOR[q.category] ?? 'bg-slate-100 text-slate-600'}`}>
                        {q.category}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
