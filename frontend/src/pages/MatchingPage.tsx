// src/pages/MatchingPage.tsx
// ───────────────────────────
// Main AI Matching Engine page.
// User selects a JD, picks top-N, hits Run → results appear below.

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { Cpu, ChevronDown, Play, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchJDs, runMatching } from '../services/api'
import type { JobDescription, MatchResponse } from '../types'
import MatchResultCard from '../components/MatchResultCard'

export default function MatchingPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()

  // Pre-select a JD if navigated from the Jobs page with ?jd=<id>
  const preselectedJdId = params.get('jd') ? Number(params.get('jd')) : null

  const [selectedJdId, setSelectedJdId] = useState<number | ''>(preselectedJdId ?? '')
  const [topN, setTopN]                 = useState(5)
  const [result, setResult]             = useState<MatchResponse | null>(null)

  // ── Fetch JD list for dropdown ────────────────────────────────
  const { data: jds = [] } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn:  fetchJDs,
  })

  useEffect(() => {
    if (preselectedJdId && jds.length > 0) {
      setSelectedJdId(preselectedJdId)
    }
  }, [preselectedJdId, jds])

  // ── Run matching mutation ─────────────────────────────────────
  const matchMutation = useMutation({
    mutationFn: () => runMatching(Number(selectedJdId), topN),
    onSuccess: (data: MatchResponse) => {
      setResult(data)
      toast.success(`Matched ${data.results.length} candidates!`)
    },
    onError: () => toast.error('Matching failed. Check your AI API key.'),
  })

  const handleRun = () => {
    if (!selectedJdId) { toast.error('Please select a Job Description'); return }
    matchMutation.mutate()
  }

  const selectedJd = jds.find((j) => j.id === selectedJdId)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Cpu size={24} /> AI Matching Engine
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Claude AI scores every candidate against your JD and generates interview questions
        </p>
      </div>

      {/* Control panel */}
      <div className="card border-blue-100 bg-blue-50">
        <h3 className="section-title text-blue-800">Configure Match</h3>
        <div className="flex flex-wrap gap-4 items-end">

          {/* JD selector */}
          <div className="flex-1 min-w-56">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Select Job Description *
            </label>
            <div className="relative">
              <select
                className="input appearance-none pr-8"
                value={selectedJdId}
                onChange={(e) => {
                  setSelectedJdId(e.target.value ? Number(e.target.value) : '')
                  setResult(null)   // clear previous results on JD change
                }}
              >
                <option value="">— Choose a JD —</option>
                {jds.map((jd) => (
                  <option key={jd.id} value={jd.id}>
                    {jd.title} {jd.company ? `· ${jd.company}` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Top-N selector */}
          <div className="w-36">
            <label className="block text-sm font-medium text-slate-700 mb-1">Top Candidates</label>
            <div className="relative">
              <select
                className="input appearance-none pr-8"
                value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
              >
                {[3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>Top {n}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={matchMutation.isPending || !selectedJdId}
            className="btn-primary flex items-center gap-2 h-10 px-6"
          >
            {matchMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                AI is working…
              </>
            ) : (
              <>
                <Play size={15} /> Run Matching
              </>
            )}
          </button>
        </div>

        {/* Selected JD summary */}
        {selectedJd && (
          <div className="mt-4 p-4 bg-white rounded-xl border border-blue-100 text-sm">
            <p className="font-semibold text-slate-700 mb-2">
              📄 {selectedJd.title}
              {selectedJd.company && <span className="text-slate-400 font-normal"> · {selectedJd.company}</span>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedJd.required_skills.map((s) => (
                <span key={s} className="badge bg-blue-100 text-blue-800">{s}</span>
              ))}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Experience: {selectedJd.experience_min}–
              {selectedJd.experience_max === 99 ? 'any' : selectedJd.experience_max} years
            </p>
          </div>
        )}
      </div>

      {/* Loading state */}
      {matchMutation.isPending && (
        <div className="card text-center py-16">
          <div className="inline-flex items-center gap-3 text-slate-600">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
            <div className="text-left">
              <p className="font-semibold">Claude AI is analysing candidates…</p>
              <p className="text-sm text-slate-400">Scoring skills, detecting gaps, writing questions</p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && !matchMutation.isPending && (
        <div className="space-y-5">

          {/* Summary bar */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Match Results for: {result.job.title}
              </h3>
              <p className="text-sm text-slate-500">
                Evaluated {result.total_candidates_evaluated} candidates · Showing top {result.results.length}
              </p>
            </div>
            <button
              onClick={() => navigate(`/app/results/${result.job.id}`)}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <Eye size={14} /> Full Report
            </button>
          </div>

          {/* Score bar chart (visual overview) */}
          <div className="card">
            <h4 className="text-sm font-semibold text-slate-600 mb-4">Score Overview</h4>
            <div className="space-y-3">
              {result.results.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-5">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-700 w-36 truncate">
                    {r.candidate.name}
                  </span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full transition-all duration-700"
                      style={{
                        width: `${r.match_score}%`,
                        backgroundColor: r.match_score >= 70 ? '#16a34a'
                                       : r.match_score >= 45 ? '#d97706' : '#dc2626',
                      }}
                    />
                  </div>
                  <span className="text-sm font-bold w-12 text-right text-slate-700">
                    {r.match_score.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed result cards */}
          <div className="space-y-4">
            {result.results.map((r, i) => (
              <MatchResultCard key={r.id} result={r} rank={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
