// src/pages/ResultsPage.tsx
// ──────────────────────────
// Full report view for a specific JD's match results.
// Reads cached results from the DB (no re-running AI).
// Also shows an AI executive summary.

import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileText, Cpu } from 'lucide-react'
import { fetchMatchResults, fetchJD, fetchExecutiveSummary } from '../services/api'
import type { MatchResult, JobDescription } from '../types'
import MatchResultCard from '../components/MatchResultCard'

export default function ResultsPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate  = useNavigate()
  const id        = Number(jobId)

  // ── Fetch the JD ──────────────────────────────────────────────
  const { data: jd } = useQuery<JobDescription>({
    queryKey: ['jd', id],
    queryFn:  () => fetchJD(id),
    enabled:  !!id,
  })

  // ── Fetch match results ───────────────────────────────────────
  const { data: results = [], isLoading } = useQuery<MatchResult[]>({
    queryKey: ['match-results', id],
    queryFn:  () => fetchMatchResults(id),
    enabled:  !!id,
  })

  // ── Fetch AI executive summary ────────────────────────────────
  const { data: summaryData } = useQuery<{ job_title: string; summary: string }>({
    queryKey: ['summary', id],
    queryFn:  () => fetchExecutiveSummary(id),
    enabled:  !!id && results.length > 0,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-700 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-slate-500 hover:text-slate-800 text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Back
      </button>

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileText size={24} /> Match Report
        </h2>
        {jd && (
          <p className="text-slate-500 text-sm mt-1">
            {jd.title} {jd.company ? `· ${jd.company}` : ''}
          </p>
        )}
      </div>

      {/* AI Executive Summary */}
      {summaryData?.summary && (
        <div className="card bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2 mb-3">
            <Cpu size={18} className="text-blue-700" />
            <h3 className="font-bold text-blue-800">AI Executive Summary</h3>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">{summaryData.summary}</p>
        </div>
      )}

      {/* Results */}
      {results.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <Cpu size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No results yet</p>
          <p className="text-sm mt-1">Run the AI matching engine first</p>
          <button
            className="btn-primary mt-4 text-sm"
            onClick={() => navigate(`/app/matching?jd=${id}`)}
          >
            Run Matching
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {results.length} candidates matched · Sorted by score
          </p>
          <div className="space-y-4">
            {results.map((r, i) => (
              <MatchResultCard key={r.id} result={r} rank={i + 1} defaultOpen={i === 0} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
