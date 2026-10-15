import 'server-only'
import { createClient } from '@supabase/supabase-js'

/* ------------------------------------------------------------------
 * The OmniWell mobile app's requests to the website (app/api/mobile/*).
 * The app has no website cookies; it sends its Supabase access token as
 * "Authorization: Bearer <token>". Supabase checks the token, and the
 * returned client acts as that person, so row-level security applies
 * exactly as it does for the website's own server actions.
 * ------------------------------------------------------------------ */

export async function signedInFromBearer(req: Request) {
  const header = req.headers.get('authorization') ?? ''
  const token = /^Bearer ([A-Za-z0-9._-]{20,4096})$/.exec(header)?.[1]
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!token || !url || !anon) return null
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return { supabase, userId: data.user.id, email: data.user.email ?? null }
}

/** Requests from the app only: JSON bodies, never form posts from other sites. */
export const isJson = (req: Request) => (req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')
