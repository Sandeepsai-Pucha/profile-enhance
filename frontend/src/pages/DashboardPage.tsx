// src/pages/DashboardPage.tsx
// ────────────────────────────
// Overview cards showing system stats and quick-action links.

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, FileText, Cpu, TrendingUp, ArrowRight } from 'lucide-react'
import { fetchCandidates, fetchJDs } from '../services/api'
import { useAuth } from '../context/AuthContext'
import type { CandidateProfile, JobDescription } from '../types'

export default function DashboardPage() {
  const { user } = useAuth()

  // ── Fetch summary data for stats cards ───────────────────────
  const { data: candidates = [] } = useQuery<CandidateProfile[]>({
    queryKey: ['candidates'],
    queryFn: fetchCandidates,
  })

  const { data: jds = [] } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn: fetchJDs,
  })

  // Derive some quick stats
  const avgExp = candidates.length
    ? (candidates.reduce((s, c) => s + c.experience_years, 0) / candidates.length).toFixed(1)
    : '—'

  const STATS = [
    {
      label: 'Total Candidates',
      value: candidates.length,
      icon: Users,
      color: 'bg-blue-50 text-blue-700',
      link: '/app/candidates',
    },
    {
      label: 'Job Descriptions',
      value: jds.length,
      icon: FileText,
      color: 'bg-green-50 text-green-700',
      link: '/app/jobs',
    },
    {
      label: 'Avg. Experience (yrs)',
      value: avgExp,
      icon: TrendingUp,
      color: 'bg-purple-50 text-purple-700',
      link: '/app/candidates',
    },
    {
      label: 'AI Matches Run',
      value: jds.length > 0 ? jds.length : 0,
      icon: Cpu,
      color: 'bg-orange-50 text-orange-600',
      link: '/app/matching',
    },
  ]

  // Quick actions
  const QUICK_ACTIONS = [
    { label: 'Upload a Job Description', to: '/app/jobs',       emoji: '📄' },
    { label: 'Run AI Matching',          to: '/app/matching',   emoji: '🤖' },
    { label: 'View Candidates',          to: '/app/candidates', emoji: '👥' },
  ]

  return (
    <div className="space-y-8">

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-blue-800 to-blue-600 rounded-2xl p-7 text-white">
        <h2 className="text-2xl font-bold mb-1">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-blue-100 text-sm">
          Your AI-powered recruitment assistant is ready. Upload a JD and find the best-fit candidates instantly.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {STATS.map(({ label, value, icon: Icon, color, link }) => (
          <Link to={link} key={label} className="card hover:shadow-md transition-shadow group">
            <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
              <Icon size={22} />
            </div>
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-slate-500 text-sm mt-1">{label}</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-blue-600 font-medium
                            opacity-0 group-hover:opacity-100 transition-opacity">
              View <ArrowRight size={12} />
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions + recent JDs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Quick actions */}
        <div className="card">
          <h3 className="section-title">Quick Actions</h3>
          <div className="space-y-3">
            {QUICK_ACTIONS.map(({ label, to, emoji }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-200
                           hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <span className="text-2xl">{emoji}</span>
                <span className="font-medium text-slate-700 group-hover:text-blue-700">
                  {label}
                </span>
                <ArrowRight size={16} className="ml-auto text-slate-400 group-hover:text-blue-600" />
              </Link>
            ))}
          </div>
        </div>

        {/* Recent JDs */}
        <div className="card">
          <h3 className="section-title">Recent Job Descriptions</h3>
          {jds.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No JDs yet. Upload your first one!</p>
              <Link to="/app/jobs" className="btn-primary mt-4 inline-block text-sm">
                Upload JD
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {jds.slice(0, 4).map((jd) => (
                <div key={jd.id}
                  className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center
                                  text-blue-700 shrink-0 mt-0.5">
                    <FileText size={14} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">{jd.title}</p>
                    <p className="text-slate-400 text-xs">{jd.company ?? 'No company'}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {jd.required_skills.slice(0, 3).map((s) => (
                        <span key={s} className="badge bg-blue-50 text-blue-700">{s}</span>
                      ))}
                      {jd.required_skills.length > 3 && (
                        <span className="badge bg-slate-100 text-slate-500">
                          +{jd.required_skills.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/app/matching`}
                    className="shrink-0 text-xs font-medium text-blue-600 hover:underline mt-1"
                  >
                    Match →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="card">
        <h3 className="section-title">How Skillify Works</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          {[
            { step: '01', title: 'Sign in', desc: 'Google OAuth secures your account' },
            { step: '02', title: 'Add Candidates', desc: 'Import from Google Drive or manually' },
            { step: '03', title: 'Upload JD',      desc: 'Paste or upload a job description' },
            { step: '04', title: 'AI Match',        desc: 'Get scores, gaps & interview questions' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-slate-50 rounded-xl p-4">
              <div className="text-3xl font-black text-blue-200 mb-2">{step}</div>
              <p className="font-bold text-slate-700">{title}</p>
              <p className="text-slate-500 text-xs mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
