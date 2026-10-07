'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { captureInstallPrompt, type BeforeInstallPromptEvent } from '@/lib/pwa'

/* ------------------------------------------------------------------
 * App-wide PWA glue, mounted once in the root layout:
 *  - keeps the browser's install offer for the Install button (lib/pwa.ts);
 *  - when a new version of the service worker is ready, shows a small
 *    "Refresh" toast instead of swapping versions mid-entry. Tapping it
 *    activates the new worker and reloads once.
 * The worker itself is registered by @serwist/next (production only).
 * ------------------------------------------------------------------ */

/** How often an open tab checks for a new version. */
const UPDATE_CHECK_MS = 60 * 60 * 1000

export function PwaClient() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)
  // Set by Refresh. A first install also changes controller (clientsClaim) and mustn't reload.
  const refreshRequested = useRef(false)
  const reloading = useRef(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault() // keep it for our own Install button instead of the mini-infobar
      captureInstallPrompt(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => captureInstallPrompt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    let timer: ReturnType<typeof setInterval> | undefined
    let reg: ServiceWorkerRegistration | undefined

    // A worker is "waiting" only when it's an update (a first install activates straight away).
    const offer = (sw: ServiceWorker | null) => {
      if (sw && navigator.serviceWorker.controller) setWaiting(sw)
    }
    const watch = (r: ServiceWorkerRegistration) => {
      if (reg === r) return
      reg = r
      offer(r.waiting)
      r.addEventListener('updatefound', () => {
        const sw = r.installing
        sw?.addEventListener('statechange', () => {
          if (sw.state === 'installed') offer(sw)
        })
      })
      timer = setInterval(() => r.update().catch(() => {}), UPDATE_CHECK_MS)
    }
    navigator.serviceWorker.getRegistration().then((r) => r && watch(r))
    // Registration may finish after this runs.
    navigator.serviceWorker.ready.then(watch)

    const onControllerChange = () => {
      if (!refreshRequested.current || reloading.current) return
      reloading.current = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => {
      clearInterval(timer)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  const show = waiting && !dismissed

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed inset-x-4 bottom-24 z-[75] mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-white shadow-2xl md:bottom-6"
        >
          <p className="flex-1">A new version of OmniWell is ready.</p>
          <button
            type="button"
            onClick={() => {
              refreshRequested.current = true
              waiting?.postMessage({ type: 'SKIP_WAITING' })
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-bold text-ink hover:bg-white/90"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </button>
          <button type="button" onClick={() => setDismissed(true)} className="rounded-full p-1 text-white/80 hover:text-white" aria-label="Later">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
