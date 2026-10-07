import 'server-only'
import { createClient } from './server'

/*
 * Helpers shared by every tracker's server actions (app/actions/*).
 * Server-only: they read the caller's session cookie.
 */

export const SIGNED_OUT = 'You’re signed out. Log in again to continue.'

/** The signed-in user's id and a Supabase client acting as them, or null when signed out. */
export async function signedIn() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? { supabase, userId: user.id } : null
}

/** A Supabase client acting as the signed-in user, or null when signed out. */
export async function signedInClient() {
  return (await signedIn())?.supabase ?? null
}

/** PostgREST's "table not found" (PGRST205) means wellness.sql hasn't been run on this project. */
export function friendlyDbError(e: { code?: string; message: string }, tracker: string) {
  return e.code === 'PGRST205' ? `${tracker} tracking isn’t set up yet. Run supabase/wellness.sql in Supabase first.` : e.message
}

export const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)

export const isIsoDate = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s))
