'use client'

import { useEffect, useRef } from 'react'

/**
 * Calls `fn` every `intervalMs` while the tab is visible. Paused while
 * hidden, so a forgotten tab doesn't keep hitting the server; when the tab
 * is shown again it refreshes straight away only if a tick was missed.
 * (Window focus isn't used: it fires on every click back from DevTools or
 * another window, and the tab was never hidden.)
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
      // Back after missing a tick: refresh now rather than waiting for the next one.
      if (Date.now() - lastRun >= intervalMs) run()
      start()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, enabled])
}
