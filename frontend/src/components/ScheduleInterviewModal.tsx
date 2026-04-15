// src/components/ScheduleInterviewModal.tsx
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X, Calendar, Clock, User, ExternalLink, Mail } from 'lucide-react'
import { scheduleInterview } from '../services/api'
import type { CandidateMatchResult } from '../types'

function addMinutes(date: string, time: string, minutes: number): string {
  const [hour, minute] = time.split(':').map(Number)
  const total = hour * 60 + minute + minutes
  const endH  = Math.floor(total / 60)
  const endM  = total % 60
  return `${date}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`
}

// 30-min slots from 09:00 to 18:00
const TIME_SLOTS = Array.from({ length: 18 }, (_, i) => {
  const h = Math.floor(i / 2) + 9
  const m = i % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
})

interface Props {
  candidate: CandidateMatchResult
  jdTitle:   string
  onClose:   () => void
}

export default function ScheduleInterviewModal({ candidate, jdTitle, onClose }: Props) {
  const resume = candidate.parsed_resume
  const today  = new Date().toISOString().slice(0, 10)

  const [interviewerEmail, setInterviewerEmail] = useState('')
  const [emailError,       setEmailError]       = useState('')
  const [selectedDate,     setSelectedDate]     = useState(today)
  const [selectedTime,     setSelectedTime]     = useState('')
  const [eventLink,        setEventLink]        = useState<string | null>(null)
  const [successMsg,       setSuccessMsg]       = useState('')

  const validateEmail = (val: string) => {
    if (!val) return 'Interviewer email is required'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return 'Enter a valid email address'
    return ''
  }

  const mutation = useMutation({
    mutationFn: () => scheduleInterview({
      candidate_name:    resume.name,
      candidate_email:   resume.email ?? null,
      interviewer_email: interviewerEmail.trim(),
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

  const handleSubmit = () => {
    const err = validateEmail(interviewerEmail)
    setEmailError(err)
    if (err) return
    mutation.mutate()
  }

  const canSubmit = interviewerEmail && selectedDate && selectedTime && !mutation.isPending && !eventLink

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

          {/* Interviewer email input */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Interviewer Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                placeholder="interviewer@company.com"
                value={interviewerEmail}
                onChange={(e) => {
                  setInterviewerEmail(e.target.value)
                  if (emailError) setEmailError(validateEmail(e.target.value))
                }}
                className={`w-full pl-9 pr-3 py-2.5 border rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-sky-500
                  ${emailError ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
              />
            </div>
            {emailError && (
              <p className="text-xs text-red-500 mt-1">{emailError}</p>
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
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
              Time Slot (45 min · IST)
            </label>
            <div className="flex flex-wrap gap-2">
              {TIME_SLOTS.map((slot) => (
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
                onClick={handleSubmit}
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
