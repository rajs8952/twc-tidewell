'use client'

import { useEffect, useState } from 'react'
import { isTeam, type Team } from './messages'
import { perUser } from './per-user'

/**
 * The signed-in user's coach team (staff_team() in supabase/therapist-portal.sql),
 * or null for everyone else and while loading. For showing the link to the
 * coach portal only: the portal checks the team again on the server.
 */
const team = perUser(async (supabase): Promise<Team | null> => {
  const { data, error } = await supabase.rpc('staff_team')
  if (error) throw error
  return isTeam(data) ? data : null
})

export function useMyStaffTeam() {
  const [value, setValue] = useState<Team | null>(team.peek() ?? null)
  useEffect(() => {
    let alive = true
    team.get().then(
      (t) => alive && setValue(t),
      () => undefined,
    )
    return () => {
      alive = false
    }
  }, [])
  return value
}
