// src/components/SendEmailModal.tsx
// ───────────────────────────────────
// Modal to send a resume match report email to a candidate.
// Shows a live preview of how the email will look before sending.

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, Mail, Send, CheckCircle, AlertCircle, Eye } from 'lucide-react'
import { sendReportEmail } from '../services/api'
import type { CandidateMatchResult } from '../types'

// Default interview date = today + 3 days
function defaultInterviewDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
  } catch { return iso }
}

// ── Inline email preview component ───────────────────────────
function EmailPreview({
  candidate, jdTitle, interviewDate, customMessage,
}: {
  candidate:      CandidateMatchResult
  jdTitle:        string
  interviewDate:  string
  customMessage:  string
}) {
  const r     = candidate
  const score = Math.round(r.match_score)
  const scoreColor =
    score >= 80 ? '#16a34a' :
    score >= 60 ? '#d97706' : '#dc2626'

  return (
    <div className="bg-slate-100 rounded-xl overflow-hidden border border-slate-200 text-[13px]">

      {/* Email header bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-1.5">
        <div className="flex gap-2 text-xs">
          <span className="text-slate-400 w-10 shrink-0">To:</span>
          <span className="text-slate-700 font-medium">{r.parsed_resume.email || '—'}</span>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="text-slate-400 w-10 shrink-0">Sub:</span>
          <span className="text-slate-700">[Action Required] Resume Match Report – {jdTitle}</span>
        </div>
      </div>

      {/* Email body preview */}
      <div className="bg-slate-50 p-3">
        <div className="bg-white rounded-lg overflow-hidden shadow-sm max-h-[360px] overflow-y-auto">

          {/* Header */}
          <div className="bg-[#0f172a] px-5 py-4">
            <p className="text-white font-bold text-sm m-0">Resume Match Report</p>
            <p className="text-slate-400 text-xs mt-0.5 m-0">{jdTitle}</p>
          </div>

          <div className="px-5 py-4 space-y-4">
            <p className="text-slate-700 text-sm">Hi {r.parsed_resume.name},</p>

            {/* Intro */}
            <div className="bg-sky-50 border-l-4 border-sky-400 pl-3 py-2 pr-2 rounded-r-lg text-xs text-slate-600 leading-relaxed">
              The sales team has identified you as a potential match for a client opportunity:
              <strong> {jdTitle}</strong>. Please review this report, work on the highlighted areas,
              and be ready for a mock interview.
            </div>

            {/* Custom message */}
            {customMessage && (
              <p className="text-xs text-slate-600 leading-relaxed italic">{customMessage}</p>
            )}

            {/* Score */}
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 w-fit">
              <span className="text-2xl font-black" style={{ color: scoreColor }}>{score}</span>
              <div>
                <p className="text-xs font-semibold text-slate-700 m-0">Match Score</p>
                <p className="text-[10px] text-slate-400 m-0">out of 100</p>
              </div>
            </div>

            {/* Matched skills */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                ✅ Matched Skills ({r.matched_skills.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {r.matched_skills.length > 0
                  ? r.matched_skills.map(s => (
                      <span key={s} className="text-[11px] bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">{s}</span>
                    ))
                  : <span className="text-[11px] text-slate-400">None identified</span>
                }
              </div>
            </div>

            {/* Missing skills */}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                ⚠️ Skills to Prepare ({r.missing_skills.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {r.missing_skills.length > 0
                  ? r.missing_skills.map(s => (
                      <span key={s} className="text-[11px] bg-red-50 text-red-600 border border-red-200 px-2 py-0.5 rounded-full">{s}</span>
                    ))
                  : <span className="text-[11px] text-slate-400">No gaps identified</span>
                }
              </div>
            </div>

            {/* Improvement suggestions */}
            {r.improvement_suggestions.length > 0 && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                  📋 Resume Improvement Actions
                </p>
                <ol className="pl-4 space-y-1 m-0">
                  {r.improvement_suggestions.map((s, i) => (
                    <li key={i} className="text-xs text-slate-600 leading-relaxed">{s}</li>
                  ))}
                </ol>
              </div>
            )}

            {/* Interview date */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold text-amber-700 mb-1 m-0">📅 Mock Interview Scheduled</p>
              <p className="text-sm font-bold text-amber-900 m-0">{formatDate(interviewDate)}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-slate-50 border-t border-slate-200 px-5 py-3">
            <p className="text-[10px] text-slate-400 m-0">
              This is an internal communication sent via Skillify. Please do not reply to this email.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────
interface Props {
  candidate: CandidateMatchResult
  jdTitle:   string
  onClose:   () => void
}

export default function SendEmailModal({ candidate, jdTitle, onClose }: Props) {
  const resume = candidate.parsed_resume

  const [toEmail,       setToEmail]       = useState(resume.email || '')
  const [interviewDate, setInterviewDate] = useState(defaultInterviewDate())
  const [customMessage, setCustomMessage] = useState('')
  const [showPreview,   setShowPreview]   = useState(true)

  const today = new Date().toISOString().slice(0, 10)

  const mutation = useMutation({
    mutationFn: () => sendReportEmail({
      to_email:                toEmail,
      candidate_name:          resume.name,
      jd_title:                jdTitle,
      match_score:             candidate.match_score,
      matched_skills:          candidate.matched_skills,
      missing_skills:          candidate.missing_skills,
      improvement_suggestions: candidate.improvement_suggestions,
      interview_date:          interviewDate,
      custom_message:          customMessage || undefined,
    }),
  })

  const canSend = toEmail.trim() && interviewDate && !mutation.isPending && !mutation.isSuccess

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0F172A] text-white shrink-0">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-cyan-400" />
            <span className="font-semibold">Send Report Email</span>
            <span className="text-slate-400 text-sm">— {resume.name}</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* Success state */}
          {mutation.isSuccess && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center space-y-2">
              <CheckCircle size={32} className="mx-auto text-green-500" />
              <p className="font-semibold text-green-700 text-sm">{mutation.data?.message}</p>
              <p className="text-xs text-green-600">
                The report has been sent to <strong>{toEmail}</strong>
              </p>
            </div>
          )}

          {/* Error state */}
          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700">Failed to send email</p>
                <p className="text-xs text-red-600 mt-0.5">
                  {(mutation.error as any)?.response?.data?.detail || 'Please try again.'}
                </p>
                {(mutation.error as any)?.response?.status === 403 && (
                  <p className="text-xs text-amber-700 mt-1.5 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    💡 Sign out and sign in again to grant Gmail permission.
                  </p>
                )}
              </div>
            </div>
          )}

          {!mutation.isSuccess && (
            <>
              {/* Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                {/* To email */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    To (Candidate Email)
                  </label>
                  <input
                    type="email"
                    value={toEmail}
                    onChange={e => setToEmail(e.target.value)}
                    placeholder="candidate@company.com"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {!resume.email && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      ⚠️ Email not found in resume — please enter manually.
                    </p>
                  )}
                </div>

                {/* Interview date */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Mock Interview Date
                  </label>
                  <input
                    type="date"
                    value={interviewDate}
                    min={today}
                    onChange={e => setInterviewDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              {/* Custom message */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                  Additional Note <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  placeholder="Any specific instructions or context for the candidate…"
                  rows={2}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm resize-none
                             focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              {/* Preview toggle */}
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Eye size={12} /> Email Preview
                </p>
                <button
                  onClick={() => setShowPreview(v => !v)}
                  className="text-xs text-sky-500 hover:text-blue-900 font-medium transition-colors"
                >
                  {showPreview ? 'Hide preview' : 'Show preview'}
                </button>
              </div>

              {showPreview && (
                <EmailPreview
                  candidate={candidate}
                  jdTitle={jdTitle}
                  interviewDate={interviewDate}
                  customMessage={customMessage}
                />
              )}
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 border border-slate-200
                       rounded-lg hover:bg-slate-50 transition-colors"
          >
            {mutation.isSuccess ? 'Close' : 'Cancel'}
          </button>
          {!mutation.isSuccess && (
            <button
              onClick={() => mutation.mutate()}
              disabled={!canSend}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold
                         bg-blue-900 text-white rounded-lg hover:bg-blue-950
                         disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send Email
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
