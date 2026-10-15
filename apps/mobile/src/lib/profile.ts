import type { Profile } from '@rajs8952/core/types'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { readCache, saveCache } from './cache'
import { storage } from './trackers'

/* ------------------------------------------------------------------
 * The signed-in person's profile (water goal, weight, height, personal
 * goals), shared by every screen and re-read when a screen comes back
 * into view, so a change on one screen (or on the website) shows up.
 * ------------------------------------------------------------------ */

let current: Profile | null = null
let pending: Promise<Profile> | null = null

export function loadProfile(fresh = false): Promise<Profile> {
  if (fresh) pending = null
  pending ??= storage.profile.get().then(
    (p) => {
      void saveCache('profile', p)
      return (current = p)
    },
    async (e) => {
      pending = null
      // Offline: the copy saved on this phone, if there is one.
      const cached = await readCache<Profile>('profile')
      if (cached) return (current = cached.data)
      throw e
    },
  )
  return pending
}

/** After saving a change (e.g. weight or height). */
export function setProfile(p: Profile) {
  current = p
  pending = Promise.resolve(p)
}

/** Forget it on sign-out, so the next person never sees it. */
export function clearProfile() {
  current = null
  pending = null
}

export function useProfile() {
  const [profile, setState] = useState<Profile | null>(current)
  const [error, setError] = useState<string | null>(null)
  useFocusEffect(
    useCallback(() => {
      let alive = true
      loadProfile(true).then(
        (p) => alive && (setState(p), setError(null)),
        (e: Error) => alive && setError(e.message),
      )
      return () => {
        alive = false
      }
    }, []),
  )
  return { profile, setProfile: (p: Profile) => (setProfile(p), setState(p)), error }
}
