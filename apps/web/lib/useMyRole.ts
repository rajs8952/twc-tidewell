'use client'

import { useEffect, useState } from 'react'
import { isAppRole, type AppRole } from './admin'
import { createClient } from './supabase/client'

/**
 * The signed-in user's role (my_role() in supabase/rbac-and-chat-media.sql),
 * or null while loading. For showing or hiding admin links only: the admin
 * portal and every admin action check the role again on the server.
 */
export function useMyRole() {
  const [role, setRole] = useState<AppRole | null>(null)
  useEffect(() => {
    let alive = true
    createClient()
      .rpc('my_role')
      .then(({ data }) => alive && setRole(isAppRole(data) ? data : 'user'))
    return () => {
      alive = false
    }
  }, [])
  return role
}
