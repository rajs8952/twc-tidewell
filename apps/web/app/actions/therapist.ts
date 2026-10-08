'use server'

import { isTeam, type Team } from '@/lib/messages'
import { signedIn } from '@/lib/supabase/actions'

/*
 * Server-side check for the wellness-team portals (/therapist, /dietitian).
 * The portals' data itself is read and written from the browser under
 * row-level security (lib/chat-data.ts; supabase/therapist-portal.sql),
 * which only ever exposes the caller's own team.
 */

/** The caller's wellness team, or null for employees (and when signed out); gates each portal page. */
export async function myStaffTeam(): Promise<Team | null> {
  const session = await signedIn()
  if (!session) return null
  const { data, error } = await session.supabase.rpc('staff_team')
  return !error && isTeam(data) ? data : null
}
