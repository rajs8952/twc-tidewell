'use client'

import { useEffect, useState } from 'react'
import { errorMessage } from '@rajs8952/core/errors'
import type { ProfileStore } from '@rajs8952/core/storage'
import type { Profile } from '@rajs8952/core/types'
import { useStore, useTrackLoad } from './storage'

/** The profile, loaded from `adapter` or else the provider's storage. */
export function useStoredProfile(adapter?: ProfileStore) {
  const store = useStore('profile', adapter)
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
