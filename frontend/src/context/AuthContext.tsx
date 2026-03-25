// src/context/AuthContext.tsx
// ────────────────────────────
// Provides logged-in user state and helper functions
// to every component via useAuth() hook.

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { fetchCurrentUser } from '../services/api'
import type { User } from '../types'

interface AuthContextType {
  user: User | null               // null = not logged in
  token: string | null
  isLoading: boolean              // true while validating stored token
  login: (token: string) => any  // called after OAuth callback
  logout: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ── On mount: restore session from localStorage ──────────────
  useEffect(() => {
    const stored = localStorage.getItem('skillify_token')
    if (stored) {
      setToken(stored)
      // Verify the token is still valid by fetching /auth/me
      fetchCurrentUser()
        .then((u: User) => setUser(u))
        .catch(() => {
          // Token invalid or expired → clear it
          localStorage.removeItem('skillify_token')
          setToken(null)
        })
        .finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [])

  /** Called after Google OAuth redirects back with ?token= */
  const login = async (newToken: string) => {
    localStorage.setItem('skillify_token', newToken)
    setToken(newToken)
    const u = await fetchCurrentUser()
    setUser(u)
  }

  /** Clear all auth state and local storage. */
  const logout = () => {
    localStorage.removeItem('skillify_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/** Hook to consume auth context. Throws if used outside AuthProvider. */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
