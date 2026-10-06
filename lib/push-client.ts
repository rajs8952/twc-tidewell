'use client'

import { isIosSafari, isStandalone } from './pwa'

/* ------------------------------------------------------------------
 * Browser side of Web Push: what this device supports, and subscribing
 * with the app's VAPID public key. The subscription is then saved to
 * Supabase by app/actions/notifications.ts.
 * ------------------------------------------------------------------ */

export type PushState =
  | 'checking'
  /** No Push API (older browsers). */
  | 'unsupported'
  /** iPhone/iPad: web push only works once OmniWell is on the home screen (iOS 16.4+). */
  | 'ios-install'
  /** No service worker, e.g. in `next dev`; notifications need the live (production) app. */
  | 'no-worker'
  /** The user blocked notifications for this site in the browser. */
  | 'denied'
  | 'off'
  | 'on'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

/** The VAPID key as the bytes PushManager.subscribe expects. */
function keyBytes(base64url: string) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

/** How long to wait for the service worker on a first visit, while it's still registering. */
const WORKER_WAIT_MS = 8000

/**
 * The service worker registration. On the first visit after an install or
 * update, the worker may still be registering when this runs, so in
 * production it waits for it (briefly) instead of reporting "no worker".
 * In `next dev` there's no worker at all, so it returns null straight away.
 */
async function registration() {
  if (!navigator.serviceWorker) return null
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing || process.env.NODE_ENV !== 'production') return existing ?? null
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), WORKER_WAIT_MS))
  return Promise.race([navigator.serviceWorker.ready, timeout])
}

/** Where this device stands, plus its current subscription when there is one. */
export async function pushStatus(): Promise<{ state: PushState; subscription: PushSubscription | null }> {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!supported) return { state: isIosSafari() && !isStandalone() ? 'ios-install' : 'unsupported', subscription: null }
  const reg = await registration()
  if (!reg) return { state: 'no-worker', subscription: null }
  if (Notification.permission === 'denied') return { state: 'denied', subscription: null }
  const subscription = await reg.pushManager.getSubscription()
  return { state: subscription && Notification.permission === 'granted' ? 'on' : 'off', subscription }
}

/** Asks for permission and subscribes this browser. Throws with a readable message on failure. */
export async function subscribeToPush(): Promise<PushSubscription> {
  if (!VAPID_PUBLIC_KEY) throw new Error('Notifications aren’t configured yet (missing VAPID public key).')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(permission === 'denied' ? 'Notifications are blocked. Allow them in your browser’s site settings, then try again.' : 'Notifications weren’t allowed.')
  }
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) })
}
