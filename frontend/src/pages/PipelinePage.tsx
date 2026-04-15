// src/pages/PipelinePage.tsx
// ───────────────────────────
// Run the full 9-step resume matching pipeline for a selected JD.
// No candidate data is stored — everything is live and ephemeral.

import { useState, useEffect } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Cpu, FileText, AlertCircle,
  Users, ChevronDown, FileSearch,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchJDs, runPipeline, fetchIndexingStatus } from '../services/api'
import type { JobDescription } from '../types'
import BackButton from '../components/BackButton'

export default function PipelinePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const preselectedJdId = searchParams.get('jd') ? Number(searchParams.get('jd')) : null
  const [selectedJdId, setSelectedJdId] = useState<number | null>(preselectedJdId)
  const [topN, setTopN] = useState(5)
  const [minScore, setMinScore] = useState(40)

  const { data: jds = [], isLoading: jdsLoading } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn: fetchJDs,
  })

  const { data: indexingStatus } = useQuery({
    queryKey: ['indexing-status'],
    queryFn: fetchIndexingStatus,
  })
  const totalIndexed = indexingStatus?.total_indexed ?? 0

  useEffect(() => {
    if (preselectedJdId) setSelectedJdId(preselectedJdId)
  }, [preselectedJdId])

  const mutation = useMutation({
    mutationFn: () => runPipeline({
      jd_id: selectedJdId!,
      top_n: topN,
      min_score: minScore,
    }),
    onSuccess: (data) => {
      toast.success(`Pipeline complete — ${data.top_candidates.length} top candidate${data.top_candidates.length !== 1 ? 's' : ''} found!`)
      navigate('/app/results', { state: { result: data } })
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || 'Pipeline failed. Please try again.'
      toast.error(msg)
    },
  })

  const selectedJd = jds.find((j) => j.id === selectedJdId)

  if (!jdsLoading && jds.length === 0) {
    return (
      <div className="max-w-lg mx-auto text-center pt-20 space-y-4">
        <FileText size={48} className="mx-auto text-slate-300" />
        <h2 className="text-xl font-bold text-slate-700">No Job Descriptions yet</h2>
        <p className="text-slate-500 text-sm">Upload a JD first, then run the pipeline.</p>
        <Link to="/app/jobs"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white
                     rounded-xl text-sm font-semibold hover:bg-blue-950 transition-colors">
          <FileText size={15} /> Upload JD
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <BackButton to="/app/home" label="Back to Home" />
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Cpu size={24} /> Resume Matching Pipeline
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Matches indexed profiles against the selected JD and ranks candidates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Config panel ──────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
            <h3 className="font-semibold text-slate-700">Pipeline Settings</h3>

            {/* JD selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Job Description *
              </label>
              <div className="relative">
                <select
                  value={selectedJdId ?? ''}
                  onChange={(e) => setSelectedJdId(Number(e.target.value))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none bg-white"
                >
                  <option value="">Select a JD…</option>
                  {jds.map((jd) => (
                    <option key={jd.id} value={jd.id}>{jd.title}{jd.company ? ` @ ${jd.company}` : ''}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Indexed profiles indicator */}
            {totalIndexed > 0 ? (
              <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5">
                <FileSearch size={15} className="text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-emerald-700">
                    {totalIndexed} indexed profile{totalIndexed !== 1 ? 's' : ''} ready
                  </p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">Fetched from DB via BM25 matching</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertCircle size={15} className="text-amber-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-700">No profiles indexed yet</p>
                  <p className="text-[11px] text-amber-600 mt-0.5">
                    Go to{' '}
                    <Link to="/app/indexing" className="underline font-semibold">Index Resumes</Link>
                    {' '}and run the pipeline first.
                  </p>
                </div>
              </div>
            )}

            {/* Top N */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Top Candidates to Return: <span className="text-sky-500">{topN}</span>
              </label>
              <input type="range" min={1} max={20} value={topN}
                onChange={(e) => setTopN(Number(e.target.value))}
                className="w-full accent-blue-900" />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>1</span><span>20</span>
              </div>
            </div>

            {/* Min score */}
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Min Match Score: <span className="text-sky-500">{minScore}%</span>
              </label>
              <input type="range" min={0} max={95} step={5} value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="w-full accent-blue-900" />
              <div className="flex justify-between text-xs text-slate-400 mt-0.5">
                <span>0%</span><span>95%</span>
              </div>
            </div>

            <button
              onClick={() => mutation.mutate()}
              disabled={!selectedJdId || mutation.isPending}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 text-white
                         rounded-xl font-semibold text-sm hover:bg-blue-950
                         disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {mutation.isPending ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</>
              ) : (
                <><Cpu size={16} /> Run Pipeline</>
              )}
            </button>
          </div>

          {/* Selected JD preview */}
          {selectedJd && (
            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
              <p className="text-xs font-semibold text-sky-500 uppercase tracking-wide mb-1">Selected JD</p>
              <p className="font-bold text-slate-800 text-sm">{selectedJd.title}</p>
              {selectedJd.company && <p className="text-xs text-slate-500">{selectedJd.company}</p>}
              <p className="text-xs text-slate-500 mt-1">
                {selectedJd.required_skills.length} required skills
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedJd.required_skills.slice(0, 6).map((s) => (
                  <span key={s} className="text-[10px] bg-white border border-sky-200
                                           text-blue-900 px-1.5 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel ───────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Running */}
          {mutation.isPending && (
            <div className="bg-white border border-sky-200 rounded-2xl p-10 shadow-sm flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <p className="font-semibold text-slate-700">Pipeline running…</p>
              <p className="text-xs text-slate-400">This may take up to a minute</p>
            </div>
          )}

          {/* Idle */}
          {!mutation.isPending && (
            <div className="bg-white border border-slate-200 rounded-2xl text-center py-20">
              <Cpu size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="font-semibold text-slate-500">Configure and run the pipeline</p>
              <p className="text-sm text-slate-400 mt-1">
                Select a JD on the left, then click <strong>Run Pipeline</strong>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
