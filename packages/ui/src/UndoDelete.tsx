'use client'

import { Undo2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** How long "Undo" stays available before the delete really happens. */
const UNDO_MS = 5000

interface Pending {
  label: string
  /** Does the real delete (and handles its own failure). */
  commit: () => void | Promise<void>
  /** Puts the entry back on screen. */
  restore: () => void
}

/**
 * Deletes with an "Undo": the entry disappears straight away, a bar offers
 * Undo for 5 seconds, and only then is it really deleted. A second delete,
 * leaving the page or putting the app in the background deletes the
 * pending one at once, so nothing is lost or left half-done.
 *
 *   const undo = useUndoDelete()
 *   undo.schedule({ label: 'Check-in removed', commit, restore })
 *   … render {undo.toast} once in the tracker.
 */
export function useUndoDelete(): { schedule: (p: Pending) => void; toast: ReactNode } {
  const [shown, setShown] = useState<Pending | null>(null)
  const pending = useRef<Pending | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    pending.current = null
    setShown(null)
    if (p) void p.commit()
  }, [])

  const schedule = useCallback(
    (p: Pending) => {
      flush() // one pending delete at a time: the previous one goes through now
      pending.current = p
      setShown(p)
      timer.current = setTimeout(flush, UNDO_MS)
    },
    [flush],
  )

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const p = pending.current
    pending.current = null
    setShown(null)
    p?.restore()
  }, [])

  // Leaving the page or the app: don't keep a delete hanging.
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  const toast = shown ? (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6"
    >
      <div className="flex items-center gap-4 rounded-full bg-ink py-2 pl-5 pr-2 text-sm font-semibold text-white shadow-xl">
        <span>{shown.label}</span>
        <button
          type="button"
          onClick={undo}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 font-bold text-[#9FE3D3] transition hover:bg-white/10"
        >
          <Undo2 className="h-4 w-4" aria-hidden /> Undo
        </button>
      </div>
    </div>
  ) : null

  return { schedule, toast }
}

/** The bigger delete button's classes: a 44 px touch target (the old one was about 32 px). */
export const DELETE_BUTTON_CLASS = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30'
