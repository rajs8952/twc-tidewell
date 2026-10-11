'use client'

import { ArrowDown, Loader2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** How far (px, after resistance) a pull must go before letting go refreshes. */
const THRESHOLD = 72
const MAX_PULL = 120

/** True if `el` sits in a scrolling box that isn't at its top (then a pull should just scroll it). */
function insideScrolledBox(el: Element | null) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n)
    if (/(auto|scroll)/.test(overflowY) && n.scrollHeight > n.clientHeight) return n.scrollTop > 0
  }
  return false
}

/**
 * Pull to refresh for the mobile web app: at the top of a screen, pull down
 * and let go to reload it with fresh data (WhatsApp/Gmail style). Touch
 * screens under tablet width only; it replaces the browser's own pull to
 * refresh (switched off in globals.css) so the two don't fight.
 *
 * Skipped inside chats (they update themselves and a reload would lose a
 * draft), dialogs, form fields and anything marked data-no-pull-refresh.
 */
export function PullToRefresh() {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullRef = useRef(0)
  const busy = useRef(false)

  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    let startY: number | null = null

    const set = (v: number) => {
      pullRef.current = v
      setPull(v)
    }
    const onStart = (e: TouchEvent) => {
      startY = null
      if (busy.current || e.touches.length !== 1 || window.innerWidth >= 768 || window.scrollY > 0) return
      const target = e.target as Element
      if (target.closest('[data-no-pull-refresh], dialog[open], [role="dialog"], input, textarea, select, [contenteditable="true"]')) return
      if (insideScrolledBox(target)) return
      startY = e.touches[0]!.clientY
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const dy = e.touches[0]!.clientY - startY
      if (dy <= 0 || window.scrollY > 0) {
        if (pullRef.current) set(0)
        return
      }
      // Resistance: the further you pull, the harder it gets.
      set(Math.min(MAX_PULL, dy * 0.55))
      if (e.cancelable) e.preventDefault() // hold the page still while pulling
    }
    const onEnd = () => {
      if (startY === null) return
      startY = null
      if (pullRef.current >= THRESHOLD) {
        busy.current = true
        setRefreshing(true)
        set(THRESHOLD)
        // A beat to show the spinner, then reload everything on the screen.
        setTimeout(() => window.location.reload(), 300)
      } else {
        set(0)
      }
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  if (!pull && !refreshing) return null
  const ready = pull >= THRESHOLD
  const progress = Math.min(1, pull / THRESHOLD)

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex justify-center"
      style={{ transform: `translateY(${pull - 44}px)`, transition: pull === 0 || refreshing ? 'transform 0.2s ease-out' : 'none' }}
    >
      <div className="mt-[env(safe-area-inset-top)] flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-line" style={{ opacity: Math.max(0.3, progress) }}>
        {refreshing ? (
          <Loader2 className="h-5 w-5 animate-spin text-ink" aria-hidden />
        ) : (
          <ArrowDown className="h-5 w-5 text-ink transition-transform duration-150" style={{ transform: `rotate(${ready ? 180 : progress * 150}deg)` }} aria-hidden />
        )}
      </div>
      <span className="sr-only" role="status">
        {refreshing ? 'Refreshing' : ready ? 'Release to refresh' : ''}
      </span>
    </div>
  )
}
