'use client'

import { useSyncExternalStore } from 'react'

/* ------------------------------------------------------------------
 * Install support for the PWA. Chrome/Edge/Android fire
 * `beforeinstallprompt` once, early in the page's life, so it's captured
 * here at app start (components/pwa/PwaClient.tsx) and offered later by
 * the Install button. iPhone/iPad Safari has no such event: users add the
 * app from the Share menu instead.
 * ------------------------------------------------------------------ */

/** Chrome's install prompt event (not in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function captureInstallPrompt(e: BeforeInstallPromptEvent | null) {
  deferred = e
  emit()
}

/** Shows the browser's install dialog; true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  await e.prompt()
  const { outcome } = await e.userChoice
  // The event can only be used once.
  captureInstallPrompt(null)
  return outcome === 'accepted'
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Whether the browser is offering to install the app right now. */
export const useCanInstall = () =>
  useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  )

/** Running as an installed app (home-screen icon) rather than in a browser tab. */
export function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** iPhone or iPad Safari, where installing is "Share → Add to Home Screen". */
export function isIosSafari() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

/** Clears the PWA's runtime caches (named "omniwell-*"); used on logout. */
export async function clearAppCaches() {
  if (typeof caches === 'undefined') return
  const names = await caches.keys()
  await Promise.all(names.filter((n) => n.startsWith('omniwell-')).map((n) => caches.delete(n)))
}
