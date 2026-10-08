import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/* ==================================================================
 * ⚠️  SERVICE ROLE CLIENT: SERVER ONLY. NEVER SEND THIS TO A BROWSER.  ⚠️
 *
 * SUPABASE_SERVICE_ROLE_KEY bypasses every row-level security policy and
 * can read, change or delete ANY user's data and account. If it leaked,
 * anyone could take over OmniWell.
 *
 *  - Never import this file from a client component ('use client') or
 *    from anything a client component imports. The `server-only` import
 *    above makes the build fail if that happens.
 *  - Never prefix the key with NEXT_PUBLIC_, log it, return it from a
 *    server action, or put it in an error message.
 *  - Only use it after checking the caller is allowed (see requireAdmin
 *    in app/actions/admin.ts), and prefer the caller's own client
 *    (lib/supabase/server.ts) whenever row-level security is enough.
 * ================================================================== */

let cached: SupabaseClient | null = null

/** The service-role client, or null when the key isn't configured. */
export function supabaseAdmin(): SupabaseClient | null {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  return cached
}
