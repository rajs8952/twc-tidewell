'use client'

import { useEffect, useState } from 'react'
import { isAppRole, type AppRole } from './admin'
import { perUser } from './per-user'

/**
 * The signed-in user's role (my_role() in supabase/rbac-and-chat-media.sql),
 * or null while loading. For showing or hiding admin links only: the admin
 * portal and every admin action check the role again on the server.
 */
const role = perUser(async (supabase): Promise<AppRole> => {
  const { data, error } = await supabase.rpc('my_role')
  if (error) throw error
  return isAppRole(data) ? data : 'user'
})

export function useMyRole() {
  const [value, setValue] = useState<AppRole | null>(role.peek() ?? null)
  useEffect(() => {
    let alive = true
    role.get().then(
      (r) => alive && setValue(r),
      () => alive && setValue('user'),
    )
    return () => {
      alive = false
    }
  }, [])
  return value
}
