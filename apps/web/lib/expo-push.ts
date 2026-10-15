import 'server-only'

/* ------------------------------------------------------------------
 * Sending push notifications to the OmniWell mobile app (server only),
 * through Expo's push service, which forwards them to Apple and Google.
 * Phones register their tokens with save_mobile_push_token()
 * (supabase/mobile-push.sql).
 *
 * EXPO_ACCESS_TOKEN is only needed if "enhanced push security" is turned on
 * for the project in the Expo dashboard.
 * Messages never include anything private: titles and short prompts only.
 * ------------------------------------------------------------------ */

const ENDPOINT = 'https://exp.host/--/api/v2/push/send'
const BATCH = 100

export interface PhoneMessage {
  token: string
  title: string
  body: string
  /** In-app path to open when tapped, e.g. '/water' or '/chat/therapist'. */
  url: string
  /** Android notification channel (created by the app). */
  channelId?: 'reminders' | 'messages'
}

export interface PhoneResult {
  sent: number
  /** Tokens Expo says no longer reach a phone (app removed, notifications turned off): delete them. */
  gone: string[]
  failed: number
}

export async function sendToPhones(messages: PhoneMessage[]): Promise<PhoneResult> {
  const out: PhoneResult = { sent: 0, gone: [], failed: 0 }
  for (let i = 0; i < messages.length; i += BATCH) {
    const batch = messages.slice(i, i + BATCH)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(
          batch.map((m) => ({ to: m.token, title: m.title, body: m.body, data: { url: m.url }, sound: 'default', channelId: m.channelId ?? 'reminders', priority: 'high' })),
        ),
        cache: 'no-store',
      })
      const json = (await res.json().catch(() => ({}))) as { data?: { status: 'ok' | 'error'; details?: { error?: string } }[] }
      if (!res.ok || !Array.isArray(json.data)) {
        console.error('[expo-push] send failed', res.status)
        out.failed += batch.length
        continue
      }
      json.data.forEach((ticket, k) => {
        if (ticket.status === 'ok') out.sent++
        else if (ticket.details?.error === 'DeviceNotRegistered') out.gone.push(batch[k]!.token)
        else {
          out.failed++
          console.error('[expo-push] ticket error', ticket.details?.error ?? 'unknown')
        }
      })
    } catch (e) {
      console.error('[expo-push] request failed', (e as Error).message)
      out.failed += batch.length
    }
  }
  return out
}
