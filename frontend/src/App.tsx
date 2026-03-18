// src/App.tsx
// ────────────
// Root component that defines all client-side routes.

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import CandidatesPage from './pages/CandidatesPage'
import JobsPage from './pages/JobsPage'
import MatchingPage from './pages/MatchingPage'
import ResultsPage from './pages/ResultsPage'

/**
 * ProtectedRoute: redirect to login if not authenticated.
 * Shows a spinner while the auth state is being restored from localStorage.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-700 border-t-transparent" />
      </div>
    )
  }

  return user ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <Routes>
      {/* ── Public routes ──────────────────────────────── */}
      <Route path="/"               element={<LoginPage />} />
      <Route path="/auth/callback"  element={<AuthCallbackPage />} />

      {/* ── Protected routes (require login) ───────────── */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Nested under Layout (sidebar + topbar) */}
        <Route index              element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="candidates"  element={<CandidatesPage />} />
        <Route path="jobs"        element={<JobsPage />} />
        <Route path="matching"    element={<MatchingPage />} />
        <Route path="results/:jobId" element={<ResultsPage />} />
      </Route>

      {/* ── Fallback ────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
