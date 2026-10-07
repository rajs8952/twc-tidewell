'use client'

import { useEffect, useState } from 'react'
import { errorMessage } from '@omniwell/core/errors'
import type { Profile } from '@omniwell/core/types'
import { useTrackLoad, useTrackerStorage } from './storage'

/** The profile, loaded through the tracker storage. */
export function useStoredProfile() {
  const store = useTrackerStorage().profile
  const trackLoad = useTrackLoad()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    trackLoad(store.get()).then(
      (p) => alive && setProfile(p),
      (e) => alive && setError(errorMessage(e)),
    )
    return () => {
      alive = false
    }
  }, [store, trackLoad])

  return { profile, setProfile, error }
}
