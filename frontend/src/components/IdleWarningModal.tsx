// src/components/IdleWarningModal.tsx
// ─────────────────────────────────────
// Modal shown 2 minutes before auto sign-out due to inactivity.
// Displays a live countdown. "Stay signed in" resets the idle timer.

import { useEffect, useState } from 'react'
import { Clock, LogOut, RefreshCw } from 'lucide-react'

interface Props {
  visible:         boolean
  secondsLeft:     number    // countdown starts at 120
  onStay:          () => void
  onSignOut:       () => void
}

export default function IdleWarningModal({
  visible, secondsLeft, onStay, onSignOut,
}: Props) {
  if (!visible) return null

  const mins = Math.floor(secondsLeft / 60)
  const secs = secondsLeft % 60
  const display = `${mins}:${String(secs).padStart(2, '0')}`
  const urgent  = secondsLeft <= 30

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center">

        {/* Icon */}
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4
                         ${urgent ? 'bg-red-100' : 'bg-amber-100'}`}>
          <Clock size={32} className={urgent ? 'text-red-600' : 'text-amber-600'} />
        </div>

        <h2 className="text-xl font-bold text-slate-800 mb-2">Still there?</h2>
        <p className="text-slate-500 text-sm mb-5">
          You've been inactive. You'll be signed out automatically in:
        </p>

        {/* Countdown */}
        <div className={`text-5xl font-black mb-6 tabular-nums
                         ${urgent ? 'text-red-600' : 'text-amber-500'}`}>
          {display}
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onStay}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-900
                       text-white rounded-xl font-semibold text-sm hover:bg-blue-950 transition-colors"
          >
            <RefreshCw size={15} />
            Stay signed in
          </button>
          <button
            onClick={onSignOut}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-slate-300
                       text-slate-600 rounded-xl font-medium text-sm hover:bg-slate-50 transition-colors"
          >
            <LogOut size={15} />
            Sign out now
          </button>
        </div>
      </div>
    </div>
  )
}
