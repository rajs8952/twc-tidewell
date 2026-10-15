import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * The few things only the website's server can do for the app (it holds
 * keys the app never has): coach alerts, deleting an account
 * (apps/web/app/api/mobile/*). Each request carries the signed-in
 * person's access token; the server checks it with Supabase.
 * ------------------------------------------------------------------ */

const WEBSITE = process.env.EXPO_PUBLIC_WEBSITE_URL ?? 'https://omniwell-app.vercel.app'

export async function callWebsite<T = { ok: true }>(path: `/api/mobile/${string}`, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('You’re signed out. Log in again to continue.')
  let res: Response
  try {
    res = await fetch(`${WEBSITE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Couldn’t reach OmniWell. Check your connection and try again.')
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  // 404: the website hasn't got this yet (it's deployed separately from the app).
  if (res.status === 404) throw new Error('This isn’t available yet. Please try again later.')
  if (!res.ok) throw new Error(json.error ?? `Something went wrong (${res.status}).`)
  return json
}

/** Lets the coach(es) know about the app's message (bell and email, as from the website). Never throws. */
export function alertCoach(threadId: string, kind: 'new' | 'reply') {
  callWebsite('/api/mobile/chat-alert', { threadId, kind }).catch(() => {})
}
