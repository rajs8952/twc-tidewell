import 'server-only'
import webpush from 'web-push'
import type { PushPayload } from './notifications'

/* ------------------------------------------------------------------
 * Sending Web Push messages (server only). Signs each push with the VAPID
 * private key; the matching public key is what browsers subscribed with.
 * ------------------------------------------------------------------ */

let configured = false

/** Sets the VAPID details once; returns why not when they aren't configured. */
function vapid(): true | string {
  if (configured) return true
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT
  if (!pub || !priv || !subject) return 'Push isn’t configured: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are all needed.'
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

export interface StoredSubscription {
  endpoint: string
  p256dh: string
  auth: string
}

export type SendResult =
  | { ok: true }
  /** 404/410: the browser unsubscribed or the subscription expired; delete it. */
  | { ok: false; gone: true }
  | { ok: false; gone: false; error: string }

export async function sendPush(sub: StoredSubscription, payload: PushPayload): Promise<SendResult> {
  const ready = vapid()
  if (ready !== true) return { ok: false, gone: false, error: ready }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
      // A reminder that can't be delivered within an hour isn't worth showing late.
      TTL: 60 * 60,
      urgency: 'normal',
      // No `topic` header: some push services (Apple's) reject it, and the
      // service worker already replaces repeats using the notification tag.
    })
    return { ok: true }
  } catch (e) {
    const { statusCode: status, body } = e as { statusCode?: number; body?: string }
    if (status === 404 || status === 410) return { ok: false, gone: true }
    // The push service's own reason (e.g. Apple's {"reason":"BadJwtToken"}), shortened; it never contains the message itself.
    const reason = typeof body === 'string' ? body.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
    const host = (() => {
      try {
        return new URL(sub.endpoint).host
      } catch {
        return 'push service'
      }
    })()
    console.error('[push] send failed', host, status, reason)
    return { ok: false, gone: false, error: status ? `Push service (${host}) returned ${status}${reason ? `: ${reason}` : ''}` : (e as Error).message }
  }
}

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
