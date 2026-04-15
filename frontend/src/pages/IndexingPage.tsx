// src/pages/IndexingPage.tsx
// ───────────────────────────
// Resume upload + incremental indexing pipeline management.

import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Database, Play, Trash2, CheckCircle2, AlertCircle,
  UploadCloud, FileText, X, RefreshCw, RefreshCcw,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  uploadResumes, fetchResumeFiles,
  deleteResumeFile, runIndexing, reindexAll, resetIndexing,
} from '../services/api'
import type { ResumeFileOut, IndexingResult } from '../types'
import BackButton from '../components/BackButton'

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const ALLOWED_EXTS = ['.pdf', '.docx', '.txt']

function validateFiles(files: File[]): { valid: File[]; invalid: string[] } {
  const valid: File[] = []
  const invalid: string[] = []
  for (const f of files) {
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      invalid.push(`${f.name} — unsupported type (allowed: PDF, DOCX, TXT)`)
    } else if (f.size > 10 * 1024 * 1024) {
      invalid.push(`${f.name} — too large (max 10 MB)`)
    } else {
      valid.push(f)
    }
  }
  return { valid, invalid }
}

function formatSize(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`
}

// ─────────────────────────────────────────────────────────────
// File row
// ─────────────────────────────────────────────────────────────
function FileRow({
  file,
  onDelete,
  deleting,
}: {
  file: ResumeFileOut
  onDelete: (filename: string) => void
  deleting: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
      <FileText size={16} className="text-slate-400 shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{file.filename}</p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {formatSize(file.file_size_kb)} &middot; {new Date(file.uploaded_at).toLocaleString()}
          {file.candidate_name && (
            <span className="ml-2 text-sky-600 font-medium">{file.candidate_name}</span>
          )}
        </p>
      </div>

      {file.is_indexed ? (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
          <CheckCircle2 size={11} /> Indexed
        </span>
      ) : (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">
          <AlertCircle size={11} /> Pending
        </span>
      )}

      <button
        onClick={() => onDelete(file.filename)}
        disabled={deleting}
        title="Delete file"
        className="text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors shrink-0 ml-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Last run result banner
// ─────────────────────────────────────────────────────────────
function RunResultBanner({ result }: { result: IndexingResult }) {
  const [expanded, setExpanded] = useState(false)
  const hasErrors = result.errors.length > 0

  return (
    <div className={`rounded-2xl border ${hasErrors ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
      <div className="px-4 py-3 flex items-center justify-between">
        <p className={`text-sm font-semibold flex items-center gap-1.5 ${hasErrors ? 'text-amber-700' : 'text-green-700'}`}>
          {hasErrors
            ? <><AlertCircle size={14} /> Completed with warnings</>
            : <><CheckCircle2 size={14} /> Indexing complete</>
          }
        </p>
        <div className="flex gap-4 text-sm">
          <span className="text-slate-600">Total: <strong>{result.total}</strong></span>
          <span className="text-emerald-700">New: <strong>{result.indexed}</strong></span>
          <span className="text-sky-600">Skipped: <strong>{result.skipped}</strong></span>
          {hasErrors && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-amber-700 flex items-center gap-0.5 text-xs"
            >
              {result.errors.length} error{result.errors.length > 1 ? 's' : ''}
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <ul className="px-4 pb-3 space-y-0.5">
          {result.errors.map((e, i) => (
            <li key={i} className="text-xs text-amber-800">• {e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function IndexingPage() {
  const queryClient = useQueryClient()
  const [dragOver, setDragOver] = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [deletingFile, setDeletingFile] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Queries ──────────────────────────────────────────────
  const { data: resumeList, isLoading: listLoading } = useQuery({
    queryKey: ['resume-files'],
    queryFn: fetchResumeFiles,
  })

  // ── Mutations ────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: uploadResumes,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resume-files'] })
      if (data.errors.length > 0) {
        toast.error(`${data.saved.length} uploaded, ${data.errors.length} failed`)
      } else {
        toast.success(data.message)
      }
    },
    onError: () => toast.error('Upload failed. Please try again.'),
  })

  const indexMutation = useMutation({
    mutationFn: runIndexing,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resume-files'] })
      const msg = `${data.indexed} new indexed, ${data.skipped} skipped`
      if (data.errors.length > 0) {
        toast.error(`${msg} (${data.errors.length} error${data.errors.length > 1 ? 's' : ''})`)
      } else {
        toast.success(msg)
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Indexing failed.'),
  })

  const reindexMutation = useMutation({
    mutationFn: reindexAll,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resume-files'] })
      toast.success(`Re-indexed ${data.indexed} file(s)`)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Re-index failed.'),
  })

  const resetMutation = useMutation({
    mutationFn: resetIndexing,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resume-files'] })
      setShowConfirmReset(false)
      toast.success(data.message)
    },
    onError: () => toast.error('Reset failed.'),
  })

  // ── File handling ────────────────────────────────────────
  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const { valid, invalid } = validateFiles(Array.from(files))
    if (invalid.length > 0) {
      invalid.forEach((msg) => toast.error(msg, { duration: 4000 }))
    }
    if (valid.length > 0) {
      uploadMutation.mutate(valid)
    }
  }, [uploadMutation])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDelete = async (filename: string) => {
    setDeletingFile(filename)
    try {
      await deleteResumeFile(filename)
      queryClient.invalidateQueries({ queryKey: ['resume-files'] })
      toast.success(`'${filename}' deleted.`)
    } catch {
      toast.error('Delete failed.')
    } finally {
      setDeletingFile(null)
    }
  }

  const pendingCount = resumeList?.pending_count ?? 0
  const totalFiles  = resumeList?.total_files ?? 0
  const indexedCount = resumeList?.indexed_count ?? 0
  const isBusy = indexMutation.isPending || reindexMutation.isPending || uploadMutation.isPending

  return (
    <div className="space-y-6">
      <BackButton to="/app/home" label="Back to Home" />

      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Database size={24} /> Resume Indexing
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Upload resumes, then run the indexing pipeline to build BM25-ready profiles for fast candidate matching.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Left: Upload + Controls ──────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Upload zone */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="font-semibold text-slate-700 text-sm">Upload Resumes</h3>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
                transition-colors select-none
                ${dragOver
                  ? 'border-cyan-400 bg-cyan-50'
                  : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
                }
                ${uploadMutation.isPending ? 'opacity-60 pointer-events-none' : ''}
              `}
            >
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-500">Uploading…</p>
                </div>
              ) : (
                <>
                  <UploadCloud size={28} className={`mx-auto mb-2 ${dragOver ? 'text-cyan-500' : 'text-slate-300'}`} />
                  <p className="text-sm font-medium text-slate-600">
                    {dragOver ? 'Drop files here' : 'Click or drag & drop'}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, TXT · max 10 MB each</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />

            {/* Stats bar */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Uploaded', value: totalFiles, color: 'text-slate-700' },
                { label: 'Indexed', value: indexedCount, color: 'text-emerald-600' },
                { label: 'Pending', value: pendingCount, color: 'text-amber-600' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-50 rounded-lg py-2">
                  <p className={`text-xl font-black ${color}`}>{listLoading ? '…' : value}</p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Pipeline Controls */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-slate-700 text-sm">Pipeline Controls</h3>

            {/* Run incremental */}
            <button
              onClick={() => indexMutation.mutate()}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 text-white
                         rounded-xl font-semibold text-sm hover:bg-blue-950
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {indexMutation.isPending ? (
                <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Indexing…</>
              ) : (
                <><Play size={15} /> Run Index Pipeline{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}</>
              )}
            </button>

            {/* Re-index all */}
            <button
              onClick={() => reindexMutation.mutate()}
              disabled={isBusy}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-sky-200
                         text-sky-700 rounded-xl text-sm font-medium hover:bg-sky-50
                         disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {reindexMutation.isPending ? (
                <><div className="w-3.5 h-3.5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /> Re-indexing…</>
              ) : (
                <><RefreshCw size={14} /> Re-index All Files</>
              )}
            </button>

            {/* Reset DB profiles */}
            {!showConfirmReset ? (
              <button
                onClick={() => setShowConfirmReset(true)}
                disabled={isBusy || indexedCount === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-200
                           text-red-600 rounded-xl text-sm font-medium hover:bg-red-50
                           disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCcw size={14} /> Clear Indexed Profiles
              </button>
            ) : (
              <div className="border border-red-200 rounded-xl p-3 space-y-2 bg-red-50">
                <p className="text-xs text-red-700 font-semibold">
                  Clear all {indexedCount} indexed profiles? Files on disk are kept.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => resetMutation.mutate()}
                    disabled={resetMutation.isPending}
                    className="flex-1 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold
                               hover:bg-red-700 disabled:opacity-60"
                  >
                    {resetMutation.isPending ? 'Clearing…' : 'Yes, clear'}
                  </button>
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className="flex-1 py-1.5 border border-slate-300 text-slate-600 rounded-lg text-xs
                               font-medium hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: File list ──────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Last run banner */}
          {(indexMutation.data || reindexMutation.data) && (
            <RunResultBanner result={(indexMutation.data ?? reindexMutation.data)!} />
          )}

          {/* Running spinner */}
          {(indexMutation.isPending || reindexMutation.isPending) && (
            <div className="bg-white border border-sky-200 rounded-2xl px-5 py-4 shadow-sm flex items-center gap-3">
              <div className="w-7 h-7 border-[3px] border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <div>
                <p className="font-semibold text-slate-700 text-sm">
                  {reindexMutation.isPending ? 'Re-indexing all resumes…' : 'Indexing new resumes…'}
                </p>
                <p className="text-xs text-slate-400">Parsing and building PageIndex trees</p>
              </div>
            </div>
          )}

          {/* File list */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-semibold text-slate-700 text-sm">
                Uploaded Resumes {totalFiles > 0 && `(${totalFiles})`}
              </h3>
              {totalFiles > 0 && (
                <span className="text-[11px] text-slate-400">
                  {indexedCount} indexed · {pendingCount} pending
                </span>
              )}
            </div>

            {listLoading ? (
              <div className="py-16 text-center">
                <RefreshCw size={24} className="mx-auto text-slate-300 animate-spin mb-2" />
                <p className="text-sm text-slate-400">Loading files…</p>
              </div>
            ) : totalFiles === 0 ? (
              <div className="py-20 text-center">
                <UploadCloud size={44} className="mx-auto text-slate-200 mb-3" />
                <p className="font-semibold text-slate-500 text-sm">No resumes uploaded yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Drag &amp; drop or click the upload zone to get started.
                </p>
              </div>
            ) : (
              <div>
                {resumeList!.files.map((f) => (
                  <FileRow
                    key={f.filename}
                    file={f}
                    onDelete={handleDelete}
                    deleting={deletingFile === f.filename}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
