// src/pages/LoginPage.tsx
// ────────────────────────
// Public landing page with Google OAuth sign-in button.
// If user is already logged in, redirect to dashboard.

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getGoogleLoginUrl } from '../services/api'

export default function LoginPage() {
  const { user, isLoading } = useAuth()
  const navigate = useNavigate()

  // ── Redirect if already authenticated ────────────────────────
  useEffect(() => {
    if (!isLoading && user) {
      navigate('/app/dashboard', { replace: true })
    }
  }, [user, isLoading, navigate])

  const handleGoogleLogin = () => {
    // Redirect the browser to the FastAPI Google OAuth endpoint
    window.location.href = getGoogleLoginUrl()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700
                    flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-10 w-full max-w-md text-center">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-700 rounded-xl flex items-center justify-center">
            <span className="text-white font-black text-2xl">S</span>
          </div>
          <span className="text-3xl font-black text-blue-900">Skillify</span>
        </div>

        <h2 className="text-xl font-bold text-slate-800 mb-1">
          AI-Based Profile Matching
        </h2>
        <p className="text-slate-500 text-sm mb-8">
          Match candidates to job descriptions with the power of AI.
          Generate interview questions in seconds.
        </p>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-3 mb-8 text-xs text-slate-600">
          {[
            ['🎯', 'Smart Matching'],
            ['🔍', 'Skill Gap Analysis'],
            ['❓', 'Interview Prep'],
          ].map(([icon, text]) => (
            <div key={text} className="bg-slate-50 rounded-lg p-3">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="font-medium">{text}</div>
            </div>
          ))}
        </div>

        {/* Google Sign-In Button */}
        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center gap-3 border-2 border-slate-200
                     rounded-xl py-3 px-5 hover:border-blue-400 hover:bg-blue-50
                     transition-all duration-200 font-semibold text-slate-700 shadow-sm"
        >
          {/* Google G logo SVG */}
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="mt-6 text-xs text-slate-400">
          Secure sign-in via Google OAuth 2.0 · Your data stays private
        </p>
      </div>
    </div>
  )
}
