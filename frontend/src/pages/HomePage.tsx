// src/pages/HomePage.tsx
// ───────────────────────
// First page shown after successful Google OAuth login.
// Displays a welcome banner and a JD upload form (file or text).

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { Upload, FileText, CheckCircle, ArrowRight, X, Cpu, CheckCheck, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchHome, uploadJDFile, createJD } from '../services/api'
import type { JobDescription } from '../types'

// ── Types returned by /home ───────────────────────────────────
interface HomeData {
  user: { id: number; name: string | null; email: string; avatar_url: string | null }
  recent_jds: Pick<JobDescription, 'id' | 'title' | 'company' | 'required_skills' | 'experience_min' | 'experience_max' | 'created_at'>[]
}

type UploadMode = 'file' | 'text'

export default function HomePage() {
  const navigate     = useNavigate()
  const queryClient  = useQueryClient()

  // ── Upload mode toggle ────────────────────────────────────
  const [mode, setMode]         = useState<UploadMode>('file')

  // ── File-upload state ─────────────────────────────────────
  const fileInputRef             = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile]         = useState<File | null>(null)
  const [fileTitle, setFileTitle]   = useState('')
  const [fileCompany, setFileCompany] = useState('')

  // ── Text-paste state ──────────────────────────────────────
  const [textTitle,   setTextTitle]   = useState('')
  const [textCompany, setTextCompany] = useState('')
  const [textBody,    setTextBody]    = useState('')

  // ── Uploaded JD (success state) ───────────────────────────
  const [uploadedJD, setUploadedJD] = useState<JobDescription | null>(null)

  // ── Login banner from sessionStorage ─────────────────────
  const [loginBanner, setLoginBanner] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    if (sessionStorage.getItem('login_success')) {
      setLoginBanner({ type: 'success', msg: 'You have successfully signed in with Google!' })
      sessionStorage.removeItem('login_success')
    } else if (sessionStorage.getItem('login_error')) {
      setLoginBanner({ type: 'error', msg: sessionStorage.getItem('login_error')! })
      sessionStorage.removeItem('login_error')
    }
  }, [])

  // ── /home data ────────────────────────────────────────────
  const { data: homeData, isLoading } = useQuery<HomeData>({
    queryKey: ['home'],
    queryFn:  fetchHome,
  })

  const goToPipeline = (jdId: number) => {
    const folder = import.meta.env.VITE_DEFAULT_DRIVE_FOLDER_ID || ''
    navigate(`/app/pipeline?jd=${jdId}${folder ? `&folder=${folder}` : ''}`)
  }

  // ── File upload mutation ──────────────────────────────────
  const fileMutation = useMutation({
    mutationFn: () => uploadJDFile(file!, fileTitle, fileCompany || undefined),
    onSuccess: (jd: JobDescription) => {
      queryClient.invalidateQueries({ queryKey: ['jds'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      toast.success('JD uploaded! Launching pipeline…')
      goToPipeline(jd.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Upload failed. Please try again.'),
  })

  // ── Text submit mutation ──────────────────────────────────
  const textMutation = useMutation({
    mutationFn: () => createJD({ title: textTitle, company: textCompany || undefined, jd_text: textBody }),
    onSuccess: (jd: JobDescription) => {
      queryClient.invalidateQueries({ queryKey: ['jds'] })
      queryClient.invalidateQueries({ queryKey: ['home'] })
      toast.success('JD saved! Launching pipeline…')
      goToPipeline(jd.id)
    },
    onError: (e: any) => toast.error(e?.response?.data?.detail || 'Failed to save JD. Please try again.'),
  })

  const isBusy = fileMutation.isPending || textMutation.isPending

  // ── Drop handlers ─────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
      if (!fileTitle) setFileTitle(dropped.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null
    if (picked) {
      setFile(picked)
      if (!fileTitle) setFileTitle(picked.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleFileSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!file)       return toast.error('Please select a file.')
    if (!fileTitle)  return toast.error('Please enter a job title.')
    fileMutation.mutate()
  }

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!textTitle) return toast.error('Please enter a job title.')
    if (!textBody)  return toast.error('Please paste the job description text.')
    textMutation.mutate()
  }

  const resetForm = () => {
    setUploadedJD(null)
    setFile(null)
    setFileTitle('')
    setFileCompany('')
    setTextTitle('')
    setTextCompany('')
    setTextBody('')
    fileMutation.reset()
    textMutation.reset()
  }

  // ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-900 border-t-transparent" />
      </div>
    )
  }

  const user      = homeData?.user
  const recentJDs = homeData?.recent_jds ?? []

  // ── Success screen ────────────────────────────────────────
  if (uploadedJD) {
    return (
      <div className="max-w-xl mx-auto text-center space-y-6 pt-12">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle size={40} className="text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-800">JD Uploaded Successfully!</h2>
          <p className="text-slate-500 mt-1">
            <span className="font-semibold text-slate-700">{uploadedJD.title}</span>
            {uploadedJD.company && <> @ {uploadedJD.company}</>}
          </p>
        </div>
        {uploadedJD.required_skills.length > 0 && (
          <div className="bg-sky-50 rounded-xl p-4 text-left">
            <p className="text-sm font-semibold text-blue-900 mb-2">AI-extracted skills:</p>
            <div className="flex flex-wrap gap-2">
              {uploadedJD.required_skills.map((s) => (
                <span key={s} className="bg-white border border-sky-200 text-blue-900 text-xs px-2 py-1 rounded-full">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button
            onClick={resetForm}
            className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Upload Another
          </button>
          <button
            onClick={() => navigate('/app/pipeline')}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-900 text-white rounded-lg text-sm font-medium hover:bg-blue-950 transition-colors"
          >
            <Cpu size={16} />
            Run AI Matching
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    )
  }

  // ── Main home page ────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* Login success / error breadcrumb banner */}
      {loginBanner && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-xl border text-sm font-medium
          ${loginBanner.type === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {loginBanner.type === 'success'
            ? <CheckCheck size={18} className="shrink-0 mt-0.5 text-green-600" />
            : <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-600" />
          }
          <span className="flex-1">{loginBanner.msg}</span>
          <button onClick={() => setLoginBanner(null)} className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-[#0F172A] to-blue-900 rounded-2xl p-7 text-white">
        <h2 className="text-2xl font-bold mb-1">
          Welcome, {user?.name?.split(' ')[0] ?? 'there'}!
        </h2>
        <p className="text-sky-200 text-sm">
          You're signed in as <span className="font-medium text-white">{user?.email}</span>.
          Upload a Job Description below to get started with AI-powered candidate matching.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200">
          {(['file', 'text'] as UploadMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-3.5 text-sm font-medium transition-colors ${
                mode === m
                  ? 'bg-sky-50 text-blue-900 border-b-2 border-blue-900'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {m === 'file' ? 'Upload File (PDF / DOCX / TXT)' : 'Paste Text'}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ── FILE UPLOAD FORM ─────────────────────────────── */}
          {mode === 'file' && (
            <form onSubmit={handleFileSubmit} className="space-y-5">
              {/* Drag & drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-cyan-400 bg-sky-50'
                    : file
                    ? 'border-green-400 bg-green-50'
                    : 'border-slate-300 hover:border-cyan-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  className="hidden"
                  onChange={handleFileChange}
                />
                {file ? (
                  <>
                    <FileText size={36} className="mx-auto text-green-600 mb-2" />
                    <p className="font-semibold text-green-700 text-sm">{file.name}</p>
                    <p className="text-slate-400 text-xs mt-1">
                      {(file.size / 1024).toFixed(1)} KB — click to change
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setFile(null) }}
                      className="absolute top-3 right-3 text-slate-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <Upload size={36} className="mx-auto text-slate-400 mb-2" />
                    <p className="font-semibold text-slate-700">Drop your JD file here</p>
                    <p className="text-slate-400 text-xs mt-1">or click to browse — PDF, DOCX, TXT</p>
                  </>
                )}
              </div>

              {/* Title + company */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Backend Engineer"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={fileCompany}
                    onChange={(e) => setFileCompany(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 hover:bg-blue-950
                           disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {isBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Uploading & parsing with AI…
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload & Parse JD
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── TEXT PASTE FORM ──────────────────────────────── */}
          {mode === 'text' && (
            <form onSubmit={handleTextSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Backend Engineer"
                    value={textTitle}
                    onChange={(e) => setTextTitle(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="e.g. Acme Corp"
                    value={textCompany}
                    onChange={(e) => setTextCompany(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Job Description Text <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={10}
                  placeholder="Paste the full job description here. Claude AI will extract required skills, experience range, and more…"
                  value={textBody}
                  onChange={(e) => setTextBody(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">{textBody.length} characters</p>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 hover:bg-blue-950
                           disabled:opacity-60 text-white font-semibold rounded-xl text-sm transition-colors"
              >
                {isBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving & parsing with AI…
                  </>
                ) : (
                  <>
                    <FileText size={16} />
                    Save & Parse JD
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Recent JDs */}
      {recentJDs.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-700">Your Recent Job Descriptions</h3>
            <Link to="/app/jobs" className="text-xs text-sky-500 hover:underline font-medium">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentJDs.map((jd) => (
              <div
                key={jd.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-sky-200 hover:bg-sky-50 transition-colors"
              >
                <div className="w-9 h-9 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-blue-900" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-800 text-sm truncate">{jd.title}</p>
                  <p className="text-slate-400 text-xs">{jd.company ?? 'No company'}</p>
                </div>
                <Link
                  to={`/app/pipeline?jd=${jd.id}`}
                  className="flex items-center gap-1 text-xs text-sky-500 font-medium hover:underline shrink-0"
                >
                  Match <ArrowRight size={12} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
