// src/components/Layout.tsx
// ──────────────────────────
// Persistent shell: sidebar navigation + top header.
// All protected pages render inside <Outlet />.

import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, Cpu, LogOut, ChevronRight,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import clsx from 'clsx'

// ── Navigation items ───────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/app/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/app/candidates', icon: Users,            label: 'Candidates' },
  { to: '/app/jobs',       icon: FileText,         label: 'Job Descriptions' },
  { to: '/app/matching',   icon: Cpu,              label: 'AI Matching' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className="w-64 bg-[#1e3a8a] flex flex-col shadow-xl">

        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-blue-700">
          <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center">
            <span className="text-blue-800 font-black text-lg">S</span>
          </div>
          <div>
            <p className="text-white font-bold text-lg leading-none">Skillify</p>
            <p className="text-blue-200 text-xs">AI Talent Engine</p>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-white text-blue-900 shadow'
                    : 'text-blue-100 hover:bg-blue-700',
                )
              }
            >
              <Icon size={18} />
              {label}
              {/* Active indicator chevron */}
              <ChevronRight size={14} className="ml-auto opacity-50" />
            </NavLink>
          ))}
        </nav>

        {/* User section at bottom */}
        <div className="border-t border-blue-700 p-4">
          <div className="flex items-center gap-3 mb-3">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name || 'User'}
                className="w-9 h-9 rounded-full object-cover border-2 border-blue-400"
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
                {user?.name?.[0] ?? 'U'}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-blue-300 text-xs truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-blue-200
                       hover:bg-blue-700 text-sm transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-4
                           flex items-center justify-between shadow-sm">
          <h1 className="text-slate-700 font-semibold text-base">
            AI-Based Profile Matching & Interview Preparation
          </h1>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            System Online
          </div>
        </header>

        {/* Page content injected here by the router */}
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
