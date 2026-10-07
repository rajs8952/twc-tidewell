'use client'

import { useEffect, useMemo, useState } from 'react'
import { flushPendingAvatar } from './avatar'
import { getProfile } from './data'
import { errorMessage } from '@rajs8952/core/errors'
import { createClient } from './supabase/client'
import type { Profile } from '@rajs8952/core/types'
import { trackProgress } from './progress'

/**
 * The signed-in user's profile for a page. Also uploads a profile photo that
 * was chosen at sign-up but couldn't be saved until the first login.
 */
export function useProfile() {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const p = await trackProgress(getProfile(supabase))
        if (!alive) return
        setProfile(p)
        const url = await flushPendingAvatar(supabase, p.id)
        if (url && alive) setProfile({ ...p, avatar_url: url })
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [supabase])

  return { profile, setProfile, error }
}
