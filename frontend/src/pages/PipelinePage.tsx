// src/pages/PipelinePage.tsx
// ───────────────────────────
// Run the full 9-step resume matching pipeline for a selected JD.
// No candidate data is stored — everything is live and ephemeral.

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import {
  Cpu, FileText, AlertCircle, CheckCircle2, Clock,
  Users, BarChart3, ChevronDown, FolderOpen, X,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchJDs, runPipeline, searchDriveFolders } from '../services/api'
import type { JobDescription, PipelineResponse } from '../types'
import CandidateResultCard from '../components/CandidateResultCard'
import BackButton from '../components/BackButton'

// ── Pipeline step indicator ───────────────────────────────────
const STEPS = [
  'Loading JD',
  'Fetching resumes from Drive',
  'Parsing resumes with AI',
  'Matching against JD',
  'Filtering top candidates',
  'Generating improvement tips',
  'Generating interview questions',
  'Ranking & summarising',
]

function StepList({ currentStep }: { currentStep: number }) {
  return (
    <div className="space-y-2">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0
            ${i < currentStep  ? 'bg-green-500'
            : i === currentStep ? 'bg-cyan-400 animate-pulse'
            : 'bg-slate-200'}`}>
            {i < currentStep ? (
              <CheckCircle2 size={12} className="text-white" />
            ) : (
              <span className={`text-[10px] font-bold ${i === currentStep ? 'text-white' : 'text-slate-400'}`}>
                {i + 1}
              </span>
            )}
          </div>
          <span className={`text-sm ${i === currentStep ? 'text-blue-900 font-semibold' : i < currentStep ? 'text-green-700' : 'text-slate-400'}`}>
            {step}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function PipelinePage() {
  const [searchParams] = useSearchParams()
  const preselectedJdId   = searchParams.get('jd') ? Number(searchParams.get('jd')) : null
  const preselectedFolder = searchParams.get('folder') || import.meta.env.VITE_DEFAULT_DRIVE_FOLDER_ID || ''

  const [selectedJdId, setSelectedJdId] = useState<number | null>(preselectedJdId)
  const [driveFolderId, setDriveFolderId] = useState(preselectedFolder)
  // Folder name search state
  const [folderResults, setFolderResults]   = useState<{ id: string; name: string }[]>([])
  const [folderName, setFolderName]         = useState('')
  const [folderSearching, setFolderSearching] = useState(false)
  const [showDropdown, setShowDropdown]     = useState(false)
  const folderDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [topN,        setTopN]      = useState(5)
  const [minScore,    setMinScore]  = useState(40)
  const [currentStep, setCurrentStep] = useState(-1)
  const [result,      setResult]    = useState<PipelineResponse | null>(null)

  const { data: jds = [], isLoading: jdsLoading } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn:  fetchJDs,
  })

  // Auto-select preselected JD
  useEffect(() => {
    if (preselectedJdId) setSelectedJdId(preselectedJdId)
  }, [preselectedJdId])

  // Folder name search — debounced
  const handleFolderSearch = (value: string) => {
    setFolderName(value)
    setDriveFolderId('')
    setShowDropdown(true)
    if (folderDebounceRef.current) clearTimeout(folderDebounceRef.current)
    if (!value.trim()) {
      setFolderResults([])
      setShowDropdown(false)
      return
    }
    folderDebounceRef.current = setTimeout(async () => {
      setFolderSearching(true)
      try {
        const results = await searchDriveFolders(value.trim())
        setFolderResults(results)
      } catch {
        setFolderResults([])
      } finally {
        setFolderSearching(false)
      }
    }, 400)
  }

  const selectFolder = (folder: { id: string; name: string }) => {
    setDriveFolderId(folder.id)
    setFolderName(folder.name)
    setFolderResults([])
    setShowDropdown(false)
  }

  const clearFolder = () => {
    setDriveFolderId('')
    setFolderName('')
    setFolderResults([])
    setShowDropdown(false)
  }

  // Simulate step progress while the pipeline is running
  useEffect(() => {
    if (currentStep < 0) return
    if (currentStep >= STEPS.length) return
    const t = setTimeout(() => setCurrentStep((s) => s + 1), 2200)
    return () => clearTimeout(t)
  }, [currentStep])

  const mutation = useMutation({
    mutationFn: () => runPipeline({
      jd_id:           selectedJdId!,
      drive_folder_id: driveFolderId || undefined,
      top_n:           topN,
      min_score:       minScore,
    }),
    onMutate: () => {
      setCurrentStep(0)
      setResult(null)
    },
    onSuccess: (data) => {
      setCurrentStep(STEPS.length)  // mark all done
      setResult(data)
      toast.success(`Pipeline complete — ${data.top_candidates.length} top candidate${data.top_candidates.length !== 1 ? 's' : ''} found!`)
    },
    onError: (e: any) => {
      setCurrentStep(-1)
      const msg = e?.response?.data?.detail || 'Pipeline failed. Please try again.'
      toast.error(msg)
    },
  })

  const selectedJd = jds.find((j) => j.id === selectedJdId)

  // ── Empty state ───────────────────────────────────────────
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
      <BackButton to="/app/jobs" label="Back to Jobs" />
      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Cpu size={24} /> Resume Matching Pipeline
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Fetches resumes from your Google Drive, parses them with AI, matches against the JD, and ranks candidates.
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

            {/* Drive folder name search */}
            <div className="relative">
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                Drive Folder <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <FolderOpen size={14} className="absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type folder name to search…"
                  value={folderName}
                  onChange={(e) => handleFolderSearch(e.target.value)}
                  onFocus={() => folderResults.length > 0 && setShowDropdown(true)}
                  className="w-full border border-slate-300 rounded-lg pl-8 pr-8 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                {folderSearching && (
                  <div className="absolute right-3 top-3 w-3.5 h-3.5 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                )}
                {folderName && !folderSearching && (
                  <button onClick={clearFolder} className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600">
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Dropdown results */}
              {showDropdown && folderResults.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {folderResults.map((f) => (
                    <li
                      key={f.id}
                      onClick={() => selectFolder(f)}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-sky-50 hover:text-blue-900"
                    >
                      <FolderOpen size={13} className="text-sky-400 shrink-0" />
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}

              {/* Resolved folder ID badge */}
              {driveFolderId && (
                <p className="text-xs text-green-600 mt-1 font-medium">
                  ✓ Folder selected — searching within "{folderName}"
                </p>
              )}
              {!driveFolderId && !folderName && (
                <p className="text-xs text-slate-400 mt-1">Leave blank to search your entire Drive</p>
              )}
            </div>

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

        {/* ── Right panel: progress / results ───────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Running — show step list */}
          {mutation.isPending && (
            <div className="bg-white border border-sky-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <div>
                  <p className="font-semibold text-slate-700">Pipeline running…</p>
                  <p className="text-xs text-slate-400">This may take 1-3 minutes depending on number of resumes</p>
                </div>
              </div>
              <StepList currentStep={currentStep} />
            </div>
          )}

          {/* Non-fatal errors */}
          {result && result.errors.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-amber-700 flex items-center gap-1.5 mb-2">
                <AlertCircle size={15} /> {result.errors.length} file(s) could not be processed
              </p>
              <ul className="space-y-1">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-800">• {e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { icon: FileText,    label: 'Files Found',  value: result.stats.total_files_found },
                  { icon: Users,       label: 'Parsed',       value: result.stats.total_parsed },
                  { icon: BarChart3,   label: 'Above Threshold', value: result.stats.total_above_threshold },
                  { icon: Clock,       label: 'Time (secs)',  value: result.stats.processing_time_secs.toFixed(1) },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <Icon size={18} className="mx-auto text-sky-500 mb-1" />
                    <p className="text-xl font-black text-slate-800">{value}</p>
                    <p className="text-xs text-slate-400">{label}</p>
                  </div>
                ))}
              </div>

              {/* Executive summary */}
              <div className="bg-gradient-to-r from-[#0F172A] to-blue-900 rounded-2xl p-5 text-white">
                <p className="text-xs font-semibold opacity-70 uppercase tracking-wide mb-2">
                  AI Executive Summary
                </p>
                <p className="text-sm leading-relaxed">{result.executive_summary}</p>
              </div>

              {/* Candidate cards */}
              {result.top_candidates.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl text-center py-14">
                  <Users size={36} className="mx-auto text-slate-300 mb-3" />
                  <p className="font-semibold text-slate-600">No candidates met the threshold</p>
                  <p className="text-sm text-slate-400 mt-1">
                    Try lowering the minimum match score or upload more resumes to Drive.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="font-semibold text-slate-700">
                    Top {result.top_candidates.length} Candidate{result.top_candidates.length !== 1 ? 's' : ''}
                  </h3>
                  {result.top_candidates.map((c, i) => (
                    <CandidateResultCard key={c.drive_file_id} result={c} rank={i + 1} jdTitle={result.jd.title} />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Idle — no result yet */}
          {!mutation.isPending && !result && (
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
