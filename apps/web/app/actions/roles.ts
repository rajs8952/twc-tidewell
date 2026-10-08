'use server'

import { isAppRole, type AppRole } from '@/lib/admin'
import { signedIn } from '@/lib/supabase/actions'

/** The caller's role ('user' when signed out or unset), via my_role() in supabase/rbac-and-chat-media.sql. */
export async function myRole(): Promise<AppRole> {
  const session = await signedIn()
  if (!session) return 'user'
  const { data, error } = await session.supabase.rpc('my_role')
  return !error && isAppRole(data) ? data : 'user'
}
