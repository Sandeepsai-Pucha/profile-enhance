// src/pages/JobsPage.tsx

import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  FileText, Plus, Trash2, Cpu, Upload, X,
  ChevronDown, ChevronUp, MapPin, Clock, GraduationCap, DollarSign, Star,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchJDs, createJD, deleteJD, uploadJDFile } from '../services/api'
import BackButton from '../components/BackButton'
import type { JobDescription } from '../types'

type UploadMode = 'text' | 'file'

function Pill({ label, color = 'purple' }: { label: string; color?: string }) {
  const styles: Record<string, string> = {
    purple: 'bg-sky-50 text-blue-900 border border-sky-200',
    green:  'bg-green-50  text-green-700  border border-green-200',
    slate:  'bg-slate-100 text-slate-600',
    amber:  'bg-amber-50  text-amber-700  border border-amber-200',
  }
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${styles[color] ?? styles.purple}`}>
      {label}
    </span>
  )
}

function JDCard({ jd, onDelete, onMatch }: {
  jd: JobDescription; onDelete: () => void; onMatch: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const expLabel =
    jd.experience_min === 0 && jd.experience_max >= 99 ? 'Not specified'
    : jd.experience_max >= 99 ? `${jd.experience_min}+ yrs`
    : `${jd.experience_min}–${jd.experience_max} yrs`

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2 mb-1">
              <h3 className="font-bold text-slate-800 text-lg leading-tight">{jd.title}</h3>
              {jd.company && (
                <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{jd.company}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
              {jd.location       && <span className="flex items-center gap-1"><MapPin size={11} />{jd.location}</span>}
              {jd.employment_type && <span className="flex items-center gap-1"><Clock size={11} />{jd.employment_type}</span>}
              <span className="flex items-center gap-1"><Star size={11} />{expLabel} exp</span>
              {jd.salary_range   && <span className="flex items-center gap-1"><DollarSign size={11} />{jd.salary_range}</span>}
              {jd.education_required && <span className="flex items-center gap-1"><GraduationCap size={11} />{jd.education_required}</span>}
            </div>
            {jd.jd_summary && (
              <p className="text-sm text-slate-600 mb-3 italic">"{jd.jd_summary}"</p>
            )}
            {jd.required_skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {jd.required_skills.map((s) => <Pill key={s} label={s} color="purple" />)}
              </div>
            )}
            {jd.nice_to_have_skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {jd.nice_to_have_skills.map((s) => <Pill key={s} label={s} color="amber" />)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <button onClick={onMatch}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 text-white
                         rounded-lg text-xs font-semibold hover:bg-blue-950 transition-colors">
              <Cpu size={13} /> Run Pipeline
            </button>
            <button onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-200
                         text-slate-600 rounded-lg text-xs hover:bg-slate-50 transition-colors">
              {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {expanded ? 'Less' : 'More'}
            </button>
            <button onClick={onDelete}
              className="p-1.5 text-slate-300 hover:text-red-500 transition-colors self-center">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-4 space-y-4 bg-slate-50 rounded-b-2xl">
          {jd.responsibilities.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Key Responsibilities</p>
              <ul className="space-y-1">
                {jd.responsibilities.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {jd.benefits.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Benefits</p>
              <div className="flex flex-wrap gap-1.5">
                {jd.benefits.map((b) => <Pill key={b} label={b} color="green" />)}
              </div>
            </div>
          )}
          <p className="text-xs text-slate-400">Uploaded {new Date(jd.created_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  )
}

export default function JobsPage() {
  const qc       = useQueryClient()
  const navigate = useNavigate()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [mode,     setMode]     = useState<UploadMode>('text')
  const [title,    setTitle]    = useState('')
  const [company,  setCompany]  = useState('')
  const [jdText,   setJdText]   = useState('')
  const [file,     setFile]     = useState<File | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const { data: jds = [], isLoading } = useQuery<JobDescription[]>({
    queryKey: ['jds'], queryFn: fetchJDs,
  })

  const goToPipeline = (jdId: number) => {
    const folder = import.meta.env.VITE_DEFAULT_DRIVE_FOLDER_ID || ''
    navigate(`/app/pipeline?jd=${jdId}${folder ? `&folder=${folder}` : ''}`)
  }

  const createMutation = useMutation({
    mutationFn: () => createJD({ title, company: company || undefined, jd_text: jdText }),
    onSuccess:  (jd) => { toast.success('JD saved & parsed! Launching pipeline…'); qc.invalidateQueries({ queryKey: ['jds'] }); resetForm(); goToPipeline(jd.id) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save JD'),
  })

  const uploadMutation = useMutation({
    mutationFn: () => uploadJDFile(file!, title, company || undefined),
    onSuccess:  (jd) => { toast.success('File uploaded & parsed! Launching pipeline…'); qc.invalidateQueries({ queryKey: ['jds'] }); resetForm(); goToPipeline(jd.id) },
    onError:    (e: any) => toast.error(e?.response?.data?.detail || 'Failed to parse file'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteJD(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['jds'] }); toast.success('JD deleted') },
    onError:    () => toast.error('Delete failed'),
  })

  const resetForm = () => { setTitle(''); setCompany(''); setJdText(''); setFile(null); setShowForm(false) }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim())                       { toast.error('Job title is required'); return }
    if (mode === 'text' && !jdText.trim())   { toast.error('JD text is required');   return }
    if (mode === 'file' && !file)            { toast.error('Please select a file');  return }
    mode === 'file' ? uploadMutation.mutate() : createMutation.mutate()
  }

  const isPending = createMutation.isPending || uploadMutation.isPending

  return (
    <div className="space-y-6">

      {/* Back */}
      <BackButton to="/app/home" label="Back to Home" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <FileText size={24} /> Job Descriptions
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            {jds.length} JD{jds.length !== 1 ? 's' : ''} · AI extracts skills, experience, responsibilities & more
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-900 text-white rounded-xl
                     text-sm font-semibold hover:bg-blue-950 transition-colors">
          {showForm ? <X size={15} /> : <Plus size={15} />}
          {showForm ? 'Cancel' : 'Upload JD'}
        </button>
      </div>

      {/* Upload form */}
      {showForm && (
        <div className="bg-white border border-sky-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-slate-700 mb-4">New Job Description</h3>
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit mb-5">
            {(['text', 'file'] as UploadMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${mode === m ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {m === 'text' ? '📝 Paste Text' : '📂 Upload File'}
              </button>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Job Title *</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                                  focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g. Senior Python Developer" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company</label>
                <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                                  focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="e.g. Acme Corp" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
            </div>
            {mode === 'text' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">JD Text *</label>
                <textarea className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                                     focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                  rows={10} placeholder="Paste the full job description here…"
                  value={jdText} onChange={(e) => setJdText(e.target.value)} />
                <p className="text-xs text-slate-400 mt-1 text-right">{jdText.length} chars</p>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')) } }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-cyan-400 bg-sky-50' : file ? 'border-green-400 bg-green-50' : 'border-slate-300 hover:border-cyan-400 hover:bg-slate-50'}`}>
                <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')) } }} />
                {file ? (
                  <div className="space-y-1">
                    <FileText size={32} className="mx-auto text-green-600" />
                    <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                    <p className="text-slate-400 text-xs">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <>
                    <Upload size={32} className="mx-auto text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-600 text-sm">Drop file here or click to browse</p>
                    <p className="text-slate-400 text-xs mt-1">PDF, DOCX, or TXT · Max 10 MB</p>
                  </>
                )}
              </div>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-xl
                           text-sm font-semibold hover:bg-blue-950 disabled:opacity-60 transition-colors">
                {isPending
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> AI is parsing…</>
                  : <><Upload size={15} /> Upload & Parse</>}
              </button>
              <button type="button" onClick={resetForm}
                className="px-5 py-2.5 border border-slate-300 text-slate-600 rounded-xl text-sm
                           font-medium hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-900 border-t-transparent" />
        </div>
      ) : jds.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl text-center py-16 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-600">No job descriptions yet</p>
          <p className="text-sm mt-1">Upload your first JD to start the pipeline</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jds.map((jd) => (
            <JDCard key={jd.id} jd={jd}
              onDelete={() => deleteMutation.mutate(jd.id)}
              onMatch={() => goToPipeline(jd.id)} />
          ))}
        </div>
      )}
    </div>
  )
}
