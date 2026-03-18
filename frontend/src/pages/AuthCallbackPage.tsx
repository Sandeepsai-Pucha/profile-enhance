// src/pages/AuthCallbackPage.tsx
// ────────────────────────────────
// Google redirects to /auth/callback?token=<jwt>
// This page reads the token, stores it, then navigates to dashboard.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function AuthCallbackPage() {
  const [params]          = useSearchParams()
  const { login }         = useAuth()
  const navigate          = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get('token')

    if (!token) {
      setError('No authentication token received from Google.')
      return
    }

    // Persist token and fetch user profile
    login(token)
      .then(() => {
        toast.success('Signed in successfully!')
        navigate('/app/dashboard', { replace: true })
      })
      .catch(() => {
        setError('Failed to verify token. Please try again.')
      })
  }, [])   // run once on mount

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="card text-center max-w-sm">
          <p className="text-red-600 font-semibold mb-4">⚠️ {error}</p>
          <button className="btn-primary" onClick={() => navigate('/')}>
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br
                    from-blue-900 to-blue-700 text-white gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent" />
      <p className="text-lg font-semibold">Signing you in…</p>
      <p className="text-blue-200 text-sm">Validating your Google account</p>
    </div>
  )
}
