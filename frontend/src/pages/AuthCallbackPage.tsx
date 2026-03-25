// src/pages/AuthCallbackPage.tsx
// ────────────────────────────────
// Google redirects here (via backend) with ?token=JWT
// We store the JWT and navigate to /app/home.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function AuthCallbackPage() {
  const [params]          = useSearchParams()
  const { login }         = useAuth()
  const navigate          = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = params.get('token')

    if (token) {
      login(token)
        .then(() => {
          // Signal HomePage to show a login-success banner
          sessionStorage.setItem('login_success', '1')
          navigate('/app/home', { replace: true })
        })
        .catch(() => {
          sessionStorage.setItem('login_error', 'Token verification failed. Please try again.')
          setError('Failed to verify your account. Please try again.')
        })
      return
    }

    setError('No authentication token received. Please try signing in again.')
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-2xl font-bold">!</span>
          </div>
          <p className="text-red-600 font-semibold mb-2">Sign-in Failed</p>
          <p className="text-slate-500 text-sm mb-5">{error}</p>
          <button
            className="px-5 py-2.5 bg-blue-900 text-white rounded-lg font-medium hover:bg-blue-950 transition-colors"
            onClick={() => navigate('/')}
          >
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br
                    from-[#0F172A] to-blue-900 text-white gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-cyan-400 border-t-transparent" />
      <p className="text-lg font-semibold">Signing you in…</p>
      <p className="text-sky-300 text-sm">Just a moment</p>
    </div>
  )
}
