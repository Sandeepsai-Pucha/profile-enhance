// src/App.tsx
// ────────────
// Root component — defines all client-side routes.

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import HomePage from './pages/HomePage'
import DashboardPage from './pages/DashboardPage'
import JobsPage from './pages/JobsPage'
import PipelinePage from './pages/PipelinePage'

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
      {/* ── Public ───────────────────────────────── */}
      <Route path="/"               element={<LoginPage />} />
      <Route path="/auth/callback"  element={<AuthCallbackPage />} />

      {/* ── Protected ────────────────────────────── */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index            element={<Navigate to="home" replace />} />
        <Route path="home"      element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="jobs"      element={<JobsPage />} />
        <Route path="pipeline"  element={<PipelinePage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
