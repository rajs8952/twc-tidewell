/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist, StaleWhileRevalidate } from 'serwist'

/* ------------------------------------------------------------------
 * OmniWell service worker (built by @serwist/next into public/sw.js).
 *
 * Privacy first: OmniWell holds health and therapy data, so ONLY the app's
 * own code, fonts and icons are cached. Pages, React Server Component
 * payloads, server actions, Supabase and the inboxes always go to the
 * network and are never stored. With no connection, page loads fall back to
 * the precached /~offline page.
 *
 * Runtime caches are named "omniwell-*" so logout can clear them
 * (components/profile/LogoutButton.tsx).
 *
 * Also shows reminder notifications pushed by the cron route and opens the
 * right tracker when one is tapped.
 * ------------------------------------------------------------------ */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time: the app's static files (JS, CSS, fonts) and /~offline.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

// Deliberately not @serwist/next's `defaultCache`: it also caches pages, RSC
// payloads and API responses, which here would store private health data.

const sameOrigin = (url: URL) => url.origin === self.location.origin

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new version waits until the user taps "Refresh" (components/pwa/PwaClient.tsx),
  // so an update never lands in the middle of an entry or a message.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Hashed build files never change, so the cached copy is always right.
      matcher: ({ url }) => sameOrigin(url) && url.pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'omniwell-static',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      // App icons and the manifest's images (generated, not personal).
      matcher: ({ url }) => sameOrigin(url) && /^\/(icon|apple-icon|icons)(\/|$)/.test(url.pathname),
      handler: new StaleWhileRevalidate({
        cacheName: 'omniwell-icons',
        plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 })],
      }),
    },
    {
      // Page loads always come from the network; this route exists so the
      // offline fallback below can catch a failed one. Nothing is cached.
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
    // Everything else (RSC payloads, server actions, Supabase, images
    // uploaded by users) has no route, so the browser fetches it normally.
  ],
  fallbacks: {
    entries: [{ url: '/~offline', matcher: ({ request }) => request.destination === 'document' }],
  },
})

// "Refresh" in the update toast asks the waiting worker to take over.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

// ---------- Reminder notifications (sent by app/api/cron/notify) ----------

interface ReminderPayload {
  title?: string
  body?: string
  icon?: string
  badge?: string
  url?: string
  tag?: string
}

/** Only paths inside the app may be opened from a notification. */
const safePath = (url: unknown) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/dashboard')

self.addEventListener('push', (event) => {
  let data: ReminderPayload = {}
  try {
    data = event.data?.json() ?? {}
  } catch {
    data = { body: event.data?.text() }
  }
  const title = data.title || 'OmniWell'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body ?? '',
      icon: data.icon ?? '/icon/192',
      badge: data.badge ?? '/icon/192',
      // A newer reminder for the same tracker replaces an unread one instead of stacking.
      tag: data.tag,
      data: { url: safePath(data.url) },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(safePath(event.notification.data?.url), self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Prefer an open OmniWell window: focus it and go to the tracker.
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        if (existing.url !== target) await existing.navigate(target).catch(() => undefined)
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

serwist.addEventListeners()
