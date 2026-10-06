'use client'

import { useEffect, useRef } from 'react'

/**
 * Calls `fn` every `intervalMs` while the tab is visible, and straight away
 * when the user comes back to it (tab shown or window focused). Paused while
 * hidden, so a forgotten tab doesn't keep hitting the server. No WebSockets:
 * plain repeated requests.
 */
export function usePolling(fn: () => unknown, intervalMs: number, enabled = true) {
  const latest = useRef(fn)
  latest.current = fn

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setInterval> | null = null
    let lastRun = Date.now()

    const run = () => {
      lastRun = Date.now()
      latest.current()
    }
    const start = () => {
      if (!timer) timer = setInterval(run, intervalMs)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return stop()
      // Coming back after a while: refresh now rather than waiting for the next tick.
      if (Date.now() - lastRun > 5_000) run()
      start()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [intervalMs, enabled])
}
