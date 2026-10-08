'use client'

import { useCallback, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------
 * Adaptive polling for chats (no WebSockets or Realtime).
 *
 * Polls fast while a conversation is active and slows down as it goes
 * quiet, so replies show up within seconds without hammering the server:
 *   active in the last 2 min   → every 3 s
 *   active in the last 10 min  → every 10 s
 *   otherwise                  → every 30 s
 * Paused while the tab is hidden; polls immediately when it comes back.
 * Call `bump()` on activity (a new message, typing, sending).
 * ------------------------------------------------------------------ */

const FAST_MS = 3_000
const MEDIUM_MS = 10_000
const SLOW_MS = 30_000

function delayFor(idleMs: number) {
  if (idleMs < 2 * 60_000) return FAST_MS
  if (idleMs < 10 * 60_000) return MEDIUM_MS
  return SLOW_MS
}

export function useLivePolling(poll: () => Promise<unknown> | unknown, enabled = true) {
  const latest = useRef(poll)
  latest.current = poll
  const lastActivity = useRef(Date.now())
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const running = useRef(false)

  const bump = useCallback(() => {
    lastActivity.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) return
    let stopped = false

    const schedule = () => {
      clearTimeout(timer.current)
      if (stopped || document.visibilityState !== 'visible') return
      timer.current = setTimeout(tick, delayFor(Date.now() - lastActivity.current))
    }
    const tick = async () => {
      if (running.current) return schedule()
      running.current = true
      try {
        await latest.current()
      } catch {
        // A failed poll is retried on the next tick.
      } finally {
        running.current = false
        schedule()
      }
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return clearTimeout(timer.current)
      // Coming back to the tab: check right away, and treat it as activity.
      lastActivity.current = Date.now()
      clearTimeout(timer.current)
      tick()
    }

    lastActivity.current = Date.now()
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer.current)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [enabled])

  return { bump }
}
