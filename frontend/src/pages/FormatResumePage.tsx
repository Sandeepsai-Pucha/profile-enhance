// src/pages/FormatResumePage.tsx
// ────────────────────────────────
// Upload a resume in any format (PDF/DOCX/TXT), format it into the ABSYZ
// profile template, preview the result, then download it — or discard and
// start over at any point.

import { useState, useRef, useCallback, useEffect } from 'react'
import { renderAsync } from 'docx-preview'
import { FileEdit, UploadCloud, FileText, X, Download, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import { convertResumeToAbsyzFormat } from '../services/api'
import BackButton from '../components/BackButton'

const ALLOWED_EXTS = ['.pdf', '.docx', '.txt']
const MAX_SIZE_BYTES = 10 * 1024 * 1024

function validateFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTS.includes(ext)) {
    return `Unsupported type (allowed: PDF, DOCX, TXT)`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return 'File too large (max 10 MB)'
  }
  return null
}

function formatSize(bytes: number): string {
  const kb = bytes / 1024
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`
}

export default function FormatResumePage() {
  const [dragOver, setDragOver] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const pickFile = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return
    const picked = files[0]
    const error = validateFile(picked)
    if (error) {
      toast.error(`${picked.name} — ${error}`)
      return
    }
    setFile(picked)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files)
  }, [pickFile])

  const reset = useCallback(() => {
    setFile(null)
    setPreviewBlob(null)
    if (previewRef.current) previewRef.current.innerHTML = ''
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleFormat = async () => {
    if (!file) return
    setIsConverting(true)
    try {
      const blob = await convertResumeToAbsyzFormat(file)
      setPreviewBlob(blob)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to format resume.')
    } finally {
      setIsConverting(false)
    }
  }

  // Render the formatted .docx into the preview container whenever it changes
  useEffect(() => {
    if (!previewBlob || !previewRef.current) return
    previewRef.current.innerHTML = ''
    renderAsync(previewBlob, previewRef.current, previewRef.current, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
    }).catch(() => {
      toast.error('Could not render preview, but the file is still downloadable.')
    })
  }, [previewBlob])

  const handleDownload = () => {
    if (!previewBlob || !file) return
    const url = URL.createObjectURL(previewBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_ABSYZ_format.docx`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    toast.success('Formatted resume downloaded.')
    reset()
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <BackButton to="/app/home" label="Back to Home" />

      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <FileEdit size={24} /> Format Resume
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Upload a resume in any format (PDF, DOCX, or TXT), preview it reformatted
          into the ABSYZ profile template, then download.
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        {!file ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-10 text-center cursor-pointer
              transition-colors select-none
              ${dragOver
                ? 'border-cyan-400 bg-cyan-50'
                : 'border-slate-200 hover:border-cyan-300 hover:bg-slate-50'
              }
            `}
          >
            <UploadCloud size={32} className={`mx-auto mb-2 ${dragOver ? 'text-cyan-500' : 'text-slate-300'}`} />
            <p className="text-sm font-medium text-slate-600">
              {dragOver ? 'Drop file here' : 'Click or drag & drop a resume'}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">PDF, DOCX, TXT · max 10 MB</p>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl">
            <FileText size={18} className="text-slate-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
              <p className="text-[11px] text-slate-400">{formatSize(file.size)}</p>
            </div>
            <button
              onClick={reset}
              disabled={isConverting}
              title="Delete file"
              className="text-slate-300 hover:text-red-500 disabled:opacity-40 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="hidden"
          onChange={(e) => pickFile(e.target.files)}
        />

        {!previewBlob && (
          <button
            onClick={handleFormat}
            disabled={!file || isConverting}
            className="w-full flex items-center justify-center gap-2 py-3 bg-blue-900 text-white
                       rounded-xl font-semibold text-sm hover:bg-blue-950
                       disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isConverting ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Formatting…</>
            ) : (
              <><FileEdit size={15} /> Format Resume</>
            )}
          </button>
        )}
      </div>

      {previewBlob && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-700 text-sm">Preview — ABSYZ Format</h3>
            <div className="flex gap-2">
              <button
                onClick={reset}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600
                           rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
              >
                <RotateCcw size={13} /> Discard &amp; Start Over
              </button>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-900 text-white
                           rounded-lg text-xs font-semibold hover:bg-blue-950 transition-colors"
              >
                <Download size={13} /> Download
              </button>
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto bg-slate-100 p-4">
            <div ref={previewRef} />
          </div>
        </div>
      )}
    </div>
  )
}
