// src/pages/InterviewersPage.tsx
// ────────────────────────────────
// Visual daily timeline of interviewer availability (9am–5pm).

import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock, User } from 'lucide-react'
import { fetchInterviewers } from '../services/api'
import type { Interviewer } from '../types'
import BackButton from '../components/BackButton'

const TIMELINE_START = 9    // 9:00
const TIMELINE_END   = 17   // 17:00
const TIMELINE_HOURS = TIMELINE_END - TIMELINE_START  // 8 hours

function timeToOffset(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h + m / 60) - TIMELINE_START
}

const COLORS = [
  { bar: 'bg-blue-900 text-white',     card: 'bg-sky-50 border-sky-200',   dot: 'bg-blue-900' },
  { bar: 'bg-cyan-500 text-slate-900', card: 'bg-cyan-50 border-cyan-200', dot: 'bg-cyan-500' },
]

function TimelineRow({ interviewer, colorIdx }: { interviewer: Interviewer; colorIdx: number }) {
  const color = COLORS[colorIdx % COLORS.length]
  const left  = (timeToOffset(interviewer.available_from) / TIMELINE_HOURS) * 100
  const width = ((timeToOffset(interviewer.available_to) - timeToOffset(interviewer.available_from)) / TIMELINE_HOURS) * 100

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full ${color.dot} flex items-center justify-center shrink-0`}>
          <User size={14} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">{interviewer.name}</p>
          <p className="text-xs text-slate-500">{interviewer.email}</p>
        </div>
      </div>
      <div className="relative h-10 bg-slate-100 rounded-lg overflow-hidden">
        <div
          className={`absolute h-full ${color.bar} rounded-lg flex items-center justify-center text-xs font-semibold`}
          style={{ left: `${left}%`, width: `${width}%` }}
        >
          {interviewer.available_from} – {interviewer.available_to}
        </div>
      </div>
    </div>
  )
}

export default function InterviewersPage() {
  const { data: interviewers = [], isLoading } = useQuery<Interviewer[]>({
    queryKey: ['interviewers'],
    queryFn:  fetchInterviewers,
  })

  const hourLabels = Array.from({ length: TIMELINE_HOURS + 1 }, (_, i) => TIMELINE_START + i)

  return (
    <div className="space-y-6">
      <BackButton to="/app/pipeline" label="Back to Pipeline" />

      <div>
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays size={24} className="text-blue-900" />
          Interviewer Availability
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Daily availability windows — all times in IST (Asia/Kolkata).
        </p>
      </div>

      {/* Timeline card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-8">

        {/* Hour ruler */}
        <div>
          <div className="flex justify-between text-xs text-slate-400 mb-2 px-0">
            {hourLabels.map((h) => (
              <span key={h} className="w-0 text-center whitespace-nowrap">{h}:00</span>
            ))}
          </div>
          <div className="relative h-px bg-slate-200">
            {hourLabels.map((h, i) => (
              <div
                key={h}
                className="absolute top-0 w-px h-2 bg-slate-300 -translate-y-1"
                style={{ left: `${(i / TIMELINE_HOURS) * 100}%` }}
              />
            ))}
          </div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="space-y-6">
            {interviewers.map((iv, i) => (
              <TimelineRow key={iv.email} interviewer={iv} colorIdx={i} />
            ))}
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {interviewers.map((iv, i) => {
          const color = COLORS[i % COLORS.length]
          return (
            <div key={iv.email} className={`${color.card} border rounded-xl p-4 space-y-1`}>
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <Clock size={13} className="text-sky-500" />
                {iv.name}
              </p>
              <p className="text-xs text-slate-600">{iv.email}</p>
              <p className="text-xs text-slate-500">
                Available: <strong>{iv.available_from} – {iv.available_to}</strong> IST
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
