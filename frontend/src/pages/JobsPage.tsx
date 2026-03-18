// src/pages/JobsPage.tsx
// ────────────────────────
// Upload job descriptions (text or file) and manage existing ones.

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Trash2, Cpu, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchJDs, createJD, deleteJD, uploadJDFile } from '../services/api'
import type { JobDescription } from '../types'
import SkillBadge from '../components/SkillBadge'

type UploadMode = 'text' | 'file'

export default function JobsPage() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const fileRef  = useRef<HTMLInputElement>(null)

  // ── Form state ────────────────────────────────────────────────
  const [mode,    setMode]    = useState<UploadMode>('text')
  const [title,   setTitle]   = useState('')
  const [company, setCompany] = useState('')
  const [jdText,  setJdText]  = useState('')
  const [file,    setFile]    = useState<File | null>(null)
  const [showForm, setShowForm] = useState(false)

  // ── Fetch JDs ─────────────────────────────────────────────────
  const { data: jds = [], isLoading } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn:  fetchJDs,
  })

  // ── Create JD (text) ──────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: () => createJD({ title, company: company || undefined, jd_text: jdText }),
    onSuccess: () => {
      toast.success('JD uploaded & analysed by AI!')
      qc.invalidateQueries({ queryKey: ['jds'] })
      resetForm()
    },
    onError: () => toast.error('Failed to upload JD'),
  })

  // ── Upload JD (file) ──────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: () => uploadJDFile(file!, title, company || undefined),
    onSuccess: () => {
      toast.success('File uploaded & parsed by AI!')
      qc.invalidateQueries({ queryKey: ['jds'] })
      resetForm()
    },
    onError: () => toast.error('Failed to parse file'),
  })

  // ── Delete JD ─────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteJD(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jds'] })
      toast.success('JD deleted')
    },
  })

  const resetForm = () => {
    setTitle(''); setCompany(''); setJdText(''); setFile(null)
    setShowForm(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title is required'); return }
    if (mode === 'text' && !jdText.trim()) { toast.error('JD text is required'); return }
    if (mode === 'file' && !file)          { toast.error('Please select a file'); return }
    mode === 'file' ? uploadMutation.mutate() : createMutation.mutate()
  }

  const isPending = createMutation.isPending || uploadMutation.isPending

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText size={24} /> Job Descriptions
          </h2>
          <p className="text-slate-500 text-sm mt-1">{jds.length} JDs · AI auto-extracts skills & experience</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2 text-sm">
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cancel' : 'Upload JD'}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div className="card border-blue-200">
          <h3 className="section-title">New Job Description</h3>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-5">
            {(['text', 'file'] as UploadMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
                  ${mode === m ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {m === 'text' ? '📝 Paste Text' : '📂 Upload File'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
                <input
                  className="input"
                  placeholder="e.g. Senior Python Developer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                <input
                  className="input"
                  placeholder="e.g. Acme Corp"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>
            </div>

            {mode === 'text' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">JD Text *</label>
                <textarea
                  className="input min-h-[180px] resize-y"
                  placeholder="Paste the full job description here…"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                />
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center
                           hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                {file ? (
                  <p className="text-sm font-medium text-blue-700">{file.name}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Click to select PDF, DOCX, or TXT</p>
                    <p className="text-xs text-slate-400 mt-1">AI will extract text automatically</p>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            <div className="flex gap-3">
              <button type="submit" className="btn-primary flex items-center gap-2" disabled={isPending}>
                {isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    AI is analysing…
                  </>
                ) : (
                  <>Upload & Analyse</>
                )}
              </button>
              <button type="button" className="btn-secondary" onClick={resetForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* JD list */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-700 border-t-transparent" />
        </div>
      ) : jds.length === 0 ? (
        <div className="card text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No job descriptions yet</p>
          <p className="text-sm mt-1">Upload your first JD to get started</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jds.map((jd) => (
            <div key={jd.id} className="card hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-800">{jd.title}</h3>
                    {jd.company && (
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        {jd.company}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    {jd.experience_min}–{jd.experience_max === 99 ? '∞' : jd.experience_max} years exp ·
                    Uploaded {new Date(jd.created_at).toLocaleDateString()}
                  </p>

                  {/* Required skills */}
                  <div className="flex flex-wrap gap-1.5">
                    {jd.required_skills.map((s) => (
                      <SkillBadge key={s} skill={s} />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 ml-4 shrink-0">
                  <button
                    onClick={() => navigate(`/app/matching?jd=${jd.id}`)}
                    className="btn-primary text-xs flex items-center gap-1 py-1.5"
                  >
                    <Cpu size={13} /> Match
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(jd.id)}
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
