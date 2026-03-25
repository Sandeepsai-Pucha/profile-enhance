// src/components/ScheduleInterviewModal.tsx
// ───────────────────────────────────────────
// Modal to schedule an interview for a matched candidate.
// Creates a Google Calendar event via the backend.

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { X, Calendar, Clock, User, ExternalLink } from 'lucide-react'
import { fetchInterviewers, scheduleInterview } from '../services/api'
import type { CandidateMatchResult, Interviewer } from '../types'

// Generate 30-minute slots between available_from and available_to
function generateSlots(from: string, to: string): string[] {
  const slots: string[] = []
  const [fh, fm] = from.split(':').map(Number)
  const [th, tm] = to.split(':').map(Number)
  let h = fh, m = fm
  while (h < th || (h === th && m < tm)) {
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    m += 30
    if (m >= 60) { h += 1; m -= 60 }
  }
  return slots
}

// Add N minutes to a date+time, returns ISO datetime string (no trailing Z — keeps local time)
function addMinutes(date: string, time: string, minutes: number): string {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const endH  = Math.floor(total / 60)
  const endM  = total % 60
  return `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`
}

interface Props {
  candidate: CandidateMatchResult
  jdTitle:   string
  onClose:   () => void
}

export default function ScheduleInterviewModal({ candidate, jdTitle, onClose }: Props) {
  const resume = candidate.parsed_resume
  const today  = new Date().toISOString().slice(0, 10)

  const [selectedEmail, setSelectedEmail] = useState('')
  const [selectedDate,  setSelectedDate]  = useState(today)
  const [selectedTime,  setSelectedTime]  = useState('')
  const [eventLink,     setEventLink]     = useState<string | null>(null)
  const [successMsg,    setSuccessMsg]    = useState('')

  const { data: interviewers = [], isLoading } = useQuery<Interviewer[]>({
    queryKey: ['interviewers'],
    queryFn:  fetchInterviewers,
  })

  const selectedInterviewer = interviewers.find(i => i.email === selectedEmail)
  const timeSlots = selectedInterviewer
    ? generateSlots(selectedInterviewer.available_from, selectedInterviewer.available_to)
    : []

  const mutation = useMutation({
    mutationFn: () => scheduleInterview({
      candidate_name:    resume.name,
      candidate_email:   resume.email ?? null,
      interviewer_email: selectedEmail,
      jd_title:          jdTitle,
      resume_url:        candidate.drive_file_url,
      ai_summary:        candidate.ai_summary,
      start_datetime:    `${selectedDate}T${selectedTime}:00`,
      end_datetime:      addMinutes(selectedDate, selectedTime, 45),
      timezone:          'Asia/Kolkata',
    }),
    onSuccess: (data) => {
      setEventLink(data.event_link)
      setSuccessMsg(data.message)
    },
  })

  const canSubmit = selectedEmail && selectedDate && selectedTime && !mutation.isPending && !eventLink

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#0F172A] text-white">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-cyan-400" />
            <span className="font-semibold">Schedule Interview</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">

          {/* Candidate info */}
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <User size={14} className="text-sky-500" />
              {resume.name}
            </div>
            {resume.email && (
              <p className="text-xs text-slate-500">{resume.email}</p>
            )}
            {candidate.drive_file_url && (
              <a
                href={candidate.drive_file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sky-500 hover:text-blue-900"
              >
                <ExternalLink size={11} /> View Resume on Drive
              </a>
            )}
            <p className="text-xs text-slate-400 italic leading-relaxed">{candidate.ai_summary}</p>
          </div>

          {/* Interviewer selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Interviewer
            </label>
            {isLoading ? (
              <p className="text-sm text-slate-400">Loading interviewers…</p>
            ) : (
              <div className="space-y-2">
                {interviewers.map((iv) => (
                  <button
                    key={iv.email}
                    onClick={() => { setSelectedEmail(iv.email); setSelectedTime('') }}
                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm
                      transition-colors text-left
                      ${selectedEmail === iv.email
                        ? 'border-blue-900 bg-blue-50 text-blue-900'
                        : 'border-slate-200 hover:border-sky-400 text-slate-700'}`}
                  >
                    <span className="font-medium">{iv.name}</span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Clock size={11} />
                      {iv.available_from} – {iv.available_to} IST
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              min={today}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Time slot picker */}
          {selectedInterviewer && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                Time Slot (45 min · IST) — {selectedInterviewer.available_from}–{selectedInterviewer.available_to}
              </label>
              <div className="flex flex-wrap gap-2">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    onClick={() => setSelectedTime(slot)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      ${selectedTime === slot
                        ? 'bg-blue-900 text-white border-blue-900'
                        : 'border-slate-200 text-slate-600 hover:border-sky-400'}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {mutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {(mutation.error as any)?.response?.data?.detail || 'Failed to schedule. Please try again.'}
            </div>
          )}

          {/* Success */}
          {eventLink && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center space-y-2">
              <p className="text-sm font-semibold text-green-700">{successMsg}</p>
              <a
                href={eventLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-sky-600 hover:text-blue-900 font-medium"
              >
                <ExternalLink size={13} /> Open in Google Calendar
              </a>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-200
                         rounded-lg hover:bg-slate-50 transition-colors"
            >
              {eventLink ? 'Close' : 'Cancel'}
            </button>
            {!eventLink && (
              <button
                onClick={() => mutation.mutate()}
                disabled={!canSubmit}
                className="px-5 py-2 text-sm font-semibold bg-blue-900 text-white
                           rounded-lg hover:bg-blue-950 disabled:opacity-50
                           disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {mutation.isPending ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scheduling…
                  </>
                ) : (
                  <>
                    <Calendar size={14} />
                    Confirm Schedule
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
