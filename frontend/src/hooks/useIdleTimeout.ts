// src/hooks/useIdleTimeout.ts
// ────────────────────────────
// Tracks user inactivity.
// Calls onWarn()   after `warnAfterMs`  ms of no activity (default 13 min)
// Calls onTimeout() after `timeoutMs`   ms of no activity (default 15 min)
// Any user activity resets both timers.

import { useEffect, useRef, useCallback } from 'react'

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'scroll', 'click',
]

interface Options {
  timeoutMs:   number          // auto-logout after this many ms
  warnAfterMs: number          // show warning after this many ms
  onWarn:      () => void      // called when warning threshold is hit
  onTimeout:   () => void      // called when idle limit is reached
  enabled:     boolean         // only run when user is logged in
}

export function useIdleTimeout({
  timeoutMs,
  warnAfterMs,
  onWarn,
  onTimeout,
  enabled,
}: Options) {
  const warnTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimers = useCallback(() => {
    if (warnTimer.current)   clearTimeout(warnTimer.current)
    if (logoutTimer.current) clearTimeout(logoutTimer.current)
  }, [])

  const resetTimers = useCallback(() => {
    clearTimers()
    warnTimer.current   = setTimeout(onWarn,    warnAfterMs)
    logoutTimer.current = setTimeout(onTimeout, timeoutMs)
  }, [clearTimers, onWarn, onTimeout, warnAfterMs, timeoutMs])

  useEffect(() => {
    if (!enabled) {
      clearTimers()
      return
    }

    // Start timers on mount
    resetTimers()

    // Reset on any activity
    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, resetTimers, { passive: true })
    )

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach((evt) =>
        window.removeEventListener(evt, resetTimers)
      )
    }
  }, [enabled, resetTimers, clearTimers])

  // Expose a manual reset so the "Stay signed in" button can use it
  return { resetTimers }
}
