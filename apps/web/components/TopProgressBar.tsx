'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useRef, useState } from 'react'
import { startProgress, useProgressActive } from '@/lib/progress'

/* ------------------------------------------------------------------
 * A thin bar in the brand gradient across the top of the page while a
 * route change or a first-load fetch is in progress (lib/progress.ts).
 *
 * The App Router has no "navigation started" event, so a route change is
 * counted from the click on an internal link until the new URL commits.
 * The bar only appears after a short delay, so fast loads show nothing,
 * then creeps towards 90% and snaps to 100% when everything is done.
 * ------------------------------------------------------------------ */

const SHOW_AFTER_MS = 150
const TRICKLE_MS = 400
/** A navigation that never commits (e.g. cancelled) releases its slot after this. */
const NAV_TIMEOUT_MS = 10_000

/** Same-origin page links that will cause a client-side route change. */
function navigatingLink(e: MouseEvent): URL | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return null
  const url = new URL(a.href, location.href)
  if (url.origin !== location.origin) return null
  // Same page (or only the #hash differs): no route change.
  if (url.pathname === location.pathname && url.search === location.search) return null
  return url
}

/** Ends a pending route change when the URL commits. Kept separate (and in Suspense) because useSearchParams needs a boundary. */
function RouteWatcher({ onCommit }: { onCommit: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    onCommit()
  }, [pathname, searchParams, onCommit])
  return null
}

export function TopProgressBar() {
  const busy = useProgressActive()
  const reduce = useReducedMotion()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const navDone = useRef<(() => void) | null>(null)
  const navTimer = useRef<ReturnType<typeof setTimeout>>()

  const endNavigation = useRef(() => {
    clearTimeout(navTimer.current)
    navDone.current?.()
    navDone.current = null
  }).current

  // Start counting a route change on internal link clicks and back/forward.
  useEffect(() => {
    const begin = () => {
      if (navDone.current) return
      navDone.current = startProgress()
      navTimer.current = setTimeout(endNavigation, NAV_TIMEOUT_MS)
    }
    const onClick = (e: MouseEvent) => {
      if (navigatingLink(e)) begin()
    }
    document.addEventListener('click', onClick, true)
    window.addEventListener('popstate', begin)
    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('popstate', begin)
      endNavigation()
    }
  }, [endNavigation])

  // Show after a short delay; creep towards 90% while busy; finish at 100% and fade.
  // Depends on `busy` only: hiding the bar mustn't re-run this and cancel its own reset.
  const shown = useRef(false)
  useEffect(() => {
    if (busy) {
      const show = setTimeout(() => {
        shown.current = true
        setVisible(true)
        setProgress((p) => Math.max(p, 0.2))
      }, SHOW_AFTER_MS)
      const trickle = setInterval(() => setProgress((p) => (p < 0.9 ? p + (0.9 - p) * 0.12 : p)), TRICKLE_MS)
      return () => {
        clearTimeout(show)
        clearInterval(trickle)
      }
    }
    // Finished before the bar ever appeared: just reset, nothing to show.
    if (!shown.current) {
      setProgress(0)
      return
    }
    // Fill to 100%, fade out, and only then reset (instantly) for next time.
    shown.current = false
    setProgress(1)
    const hide = setTimeout(() => setVisible(false), 250)
    const reset = setTimeout(() => setProgress(0), 650)
    return () => {
      clearTimeout(hide)
      clearTimeout(reset)
    }
  }, [busy])

  return (
    <>
      <Suspense fallback={null}>
        <RouteWatcher onCommit={endNavigation} />
      </Suspense>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[80] h-[3px]">
        <motion.div
          className="bg-brand-gradient h-full origin-left rounded-r-full shadow-[0_0_10px_rgba(74,91,196,0.45)]"
          initial={false}
          animate={{ scaleX: progress, opacity: visible ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { scaleX: { duration: progress === 0 ? 0 : progress === 1 ? 0.2 : 0.4, ease: 'easeOut' }, opacity: { duration: 0.3 } }}
        />
      </div>
      {/* Screen readers get one polite announcement instead of the visual bar. */}
      <p className="sr-only" role="status" aria-live="polite">
        {visible && busy ? 'Loading…' : ''}
      </p>
    </>
  )
}
