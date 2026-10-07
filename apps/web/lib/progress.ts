'use client'

import { useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------
 * Global "something is loading" counter behind the top progress bar
 * (components/TopProgressBar.tsx). Route changes and first-load fetches
 * each hold one slot while they run; the bar shows while any are held.
 * Background polling deliberately doesn't use this, so it never flickers.
 * ------------------------------------------------------------------ */

let active = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

/** Holds a slot until the returned function is called (calling it twice is harmless). */
export function startProgress(): () => void {
  active += 1
  emit()
  let done = false
  return () => {
    if (done) return
    done = true
    active = Math.max(0, active - 1)
    emit()
  }
}

/** Shows the bar while `promise` is pending, then passes its result through. */
export function trackProgress<T>(promise: Promise<T>): Promise<T> {
  const done = startProgress()
  return promise.finally(done)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True while anything holds a slot. */
export function useProgressActive() {
  return useSyncExternalStore(
    subscribe,
    () => active > 0,
    () => false,
  )
}
