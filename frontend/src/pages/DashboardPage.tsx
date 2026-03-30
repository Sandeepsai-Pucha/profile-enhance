// src/pages/DashboardPage.tsx

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, Cpu, ArrowRight, Upload, Play } from 'lucide-react'
import { fetchJDs } from '../services/api'
import { useAuth } from '../context/AuthContext'
import BackButton from '../components/BackButton'
import type { JobDescription } from '../types'

export default function DashboardPage() {
  const { user } = useAuth()

  const { data: jds = [], isLoading } = useQuery<JobDescription[]>({
    queryKey: ['jds'],
    queryFn: fetchJDs,
  })

  const totalSkills = [...new Set(jds.flatMap((j) => j.required_skills))].length
  const remoteCount = jds.filter((j) => j.location?.toLowerCase().includes('remote')).length

  const STATS = [
    { label: 'Job Descriptions', value: jds.length, icon: FileText, color: 'bg-sky-50 text-blue-900', link: '/app/jobs' },
    { label: 'Unique Required Skills', value: totalSkills, icon: Cpu, color: 'bg-green-50  text-green-700', link: '/app/jobs' },
    { label: 'Remote Roles', value: remoteCount, icon: Play, color: 'bg-pink-50   text-pink-700', link: '/app/jobs' },
    { label: 'Pipeline Ready', value: jds.length > 0 ? 'Yes' : 'No', icon: Upload, color: 'bg-amber-50  text-amber-600', link: '/app/pipeline' },
  ]

  const QUICK_ACTIONS = [
    { label: 'Upload a Job Description', to: '/app/jobs', emoji: '📄' },
    { label: 'Run Resume Pipeline', to: '/app/pipeline', emoji: '🤖' },
    { label: 'Go to Home', to: '/app/home', emoji: '🏠' },
  ]

  return (
    <div className="space-y-8">

      {/* Back */}
      <BackButton to="/app/home" label="Back to Home" />

      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-[#0F172A] to-blue-900 rounded-2xl p-7 text-white">
        <h2 className="text-2xl font-bold mb-1">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h2>
        <p className="text-sky-200 text-sm">
          Upload a Job Description, then run the pipeline to fetch resumes from Google Drive
          and get AI-ranked candidates instantly.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-5">
        {STATS.map(({ label, value, icon: Icon, color, link }) => (
          <Link to={link} key={label}
            className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-shadow group">
            <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center mb-4`}>
              <Icon size={22} />
            </div>
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-slate-500 text-sm mt-1">{label}</p>
            <div className="flex items-center gap-1 mt-3 text-xs text-sky-500 font-medium
                            opacity-0 group-hover:opacity-100 transition-opacity">
              View <ArrowRight size={12} />
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions + recent JDs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            {QUICK_ACTIONS.map(({ label, to, emoji }) => (
              <Link key={to} to={to}
                className="flex items-center gap-4 p-4 rounded-xl border border-slate-200
                           hover:border-cyan-400 hover:bg-sky-50 transition-all group">
                <span className="text-2xl">{emoji}</span>
                <span className="font-medium text-slate-700 group-hover:text-blue-900">{label}</span>
                <ArrowRight size={16} className="ml-auto text-slate-400 group-hover:text-sky-500" />
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="font-semibold text-slate-700 mb-4">Recent Job Descriptions</h3>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-7 w-7 border-4 border-blue-900 border-t-transparent" />
            </div>
          ) : jds.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <FileText size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No JDs yet. Upload your first one!</p>
              <Link to="/app/jobs"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-900
                           text-white text-sm font-semibold rounded-xl hover:bg-blue-950 transition-colors">
                <Upload size={14} /> Upload JD
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {jds.slice(0, 4).map((jd) => (
                <div key={jd.id}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center
                                  text-blue-900 shrink-0 mt-0.5">
                    <FileText size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800 text-sm truncate">{jd.title}</p>
                    <p className="text-slate-400 text-xs">{jd.company ?? 'No company'}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {jd.required_skills.slice(0, 3).map((s) => (
                        <span key={s}
                          className="text-[10px] bg-sky-50 text-blue-900 border border-sky-200
                                     px-1.5 py-0.5 rounded-full font-medium">{s}</span>
                      ))}
                      {jd.required_skills.length > 3 && (
                        <span className="text-[10px] text-slate-400">+{jd.required_skills.length - 3}</span>
                      )}
                    </div>
                  </div>
                  <Link to={`/app/pipeline?jd=${jd.id}`}
                    className="shrink-0 text-xs font-medium text-sky-500 hover:underline mt-1">
                    Run →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <h3 className="font-semibold text-slate-700 mb-4">How Skillify Works</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center text-sm">
          {[
            { step: '01', title: 'Sign in', desc: 'Google OAuth — grants Drive access' },
            { step: '02', title: 'Upload JD', desc: 'Paste or upload — AI extracts structure' },
            { step: '03', title: 'Run Pipeline', desc: 'Fetches & parses all Drive resumes with AI' },
            { step: '04', title: 'Get Results', desc: 'Ranked candidates, gaps & interview Questions' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-slate-50 rounded-xl p-4">
              <div className="text-3xl font-black text-black-500 mb-2">{step}</div>
              <p className="font-bold text-slate-700">{title}</p>
              <p className="text-slate-500 text-xs mt-1">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
