// src/main.tsx
// ─────────────
// App entry point: mounts React, wraps with providers.

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import './index.css'

// ── React Query client: global cache for all API calls ────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,               // retry failed queries once before showing error
      staleTime: 1000 * 60,   // data stays fresh for 1 minute
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* QueryClientProvider: makes useQuery/useMutation available everywhere */}
    <QueryClientProvider client={queryClient}>
      {/* BrowserRouter: enables react-router-dom navigation */}
      <BrowserRouter>
        {/* AuthProvider: stores logged-in user and JWT token */}
        <AuthProvider>
          <App />
          {/* Toaster: renders toast notifications from react-hot-toast */}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: { background: '#1e3a8a', color: '#fff', borderRadius: '8px' },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
