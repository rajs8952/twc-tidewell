'use client'

import { useEffect, useState } from 'react'
import { isTeam, type Team } from './messages'
import { createClient } from './supabase/client'

/**
 * The signed-in user's coach team (staff_team() in supabase/therapist-portal.sql),
 * or null for everyone else and while loading. For showing the link to the
 * coach portal only: the portal checks the team again on the server.
 */
export function useMyStaffTeam() {
  const [team, setTeam] = useState<Team | null>(null)
  useEffect(() => {
    let alive = true
    createClient()
      .rpc('staff_team')
      .then(({ data }) => alive && setTeam(isTeam(data) ? data : null))
    return () => {
      alive = false
    }
  }, [])
  return team
}
