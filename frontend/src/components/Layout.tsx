// src/components/Layout.tsx

import { useState, useCallback, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Home, LayoutDashboard, FileText, Cpu, LogOut, ChevronRight, CalendarDays } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useIdleTimeout } from '../hooks/useIdleTimeout'
import IdleWarningModal from './IdleWarningModal'
import clsx from 'clsx'

const IDLE_TIMEOUT_MS = 15 * 60 * 1000
const WARN_AFTER_MS = 13 * 60 * 1000
const WARNING_SECS = 120

const NAV_ITEMS = [
  { to: '/app/home', icon: Home, label: 'Home' },
  { to: '/app/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/app/jobs', icon: FileText, label: 'Job Descriptions' },
  { to: '/app/pipeline', icon: Cpu, label: 'Run Pipeline' },
  // { to: '/app/interviewers', icon: CalendarDays,    label: 'Interviewers'     },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(WARNING_SECS)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopCountdown = () => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
  }

  const startCountdown = useCallback(() => {
    setSecondsLeft(WARNING_SECS)
    setShowWarning(true)
    stopCountdown()
    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => { if (s <= 1) { stopCountdown(); return 0 } return s - 1 })
    }, 1000)
  }, [])

  const handleTimeout = useCallback(() => {
    stopCountdown(); setShowWarning(false); logout(); navigate('/')
  }, [logout, navigate])

  const { resetTimers } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS, warnAfterMs: WARN_AFTER_MS,
    onWarn: startCountdown, onTimeout: handleTimeout, enabled: !!user,
  })

  const handleStay = useCallback(() => {
    stopCountdown(); setShowWarning(false); setSecondsLeft(WARNING_SECS); resetTimers()
  }, [resetTimers])

  const handleLogout = () => { stopCountdown(); logout(); navigate('/') }

  useEffect(() => () => stopCountdown(), [])

  return (
    <>
      <IdleWarningModal visible={showWarning} secondsLeft={secondsLeft}
        onStay={handleStay} onSignOut={handleLogout} />

      <div className="flex h-screen bg-slate-50 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────── */}
        <aside className="w-64 bg-[#0F172A] flex flex-col shadow-xl">

          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-700">
            <div className="w-9 h-9 bg-cyan-400 rounded-lg flex items-center justify-center">
              <span className="text-[#0F172A] font-black text-lg">S</span>
            </div>
            <div>
              <p className="text-white font-bold text-lg leading-none">Skillify</p>
              <p className="text-sky-300 text-xs">AI Talent Engine</p>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 py-4 px-3 space-y-1">
            {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to}
                className={({ isActive }) =>
                  clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive ? 'bg-blue-900 text-white shadow' : 'text-slate-300 hover:bg-slate-700',
                  )
                }
              >
                <Icon size={18} />
                {label}
                <ChevronRight size={14} className="ml-auto opacity-50" />
              </NavLink>
            ))}
          </nav>

          {/* User */}
          <div className="border-t border-slate-700 p-4">
            <div className="flex items-center gap-3 mb-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.name || 'User'}
                  className="w-9 h-9 rounded-full object-cover border-2 border-cyan-400" />
              ) : (
                <div className="w-9 h-9 rounded-full bg-sky-500 flex items-center justify-center text-white font-bold">
                  {user?.name?.[0] ?? 'U'}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
                <p className="text-sky-300 text-xs truncate">{user?.email}</p>
              </div>
            </div>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400
                         hover:bg-slate-700 text-sm transition-colors">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-4
                             flex items-center justify-between shadow-sm">
            <h1 className="text-slate-700 font-semibold text-base">
              AI-Based Profile Matching & Interview Preparation
            </h1>
            <div className="flex items-center gap-4">
              <span className="text-xs text-slate-400 hidden sm:block">
                Auto sign-out after 15 min inactivity
              </span>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                System Online
              </div>
            </div>
          </header>

          <div className="p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </>
  )
}
