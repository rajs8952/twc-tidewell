'use client'

import { useEffect } from 'react'
import { storageKey } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'

const SYNCED_KEY = storageKey('timezone-synced')

/**
 * Saves the browser's IANA timezone (e.g. "Asia/Kolkata") to profiles.timezone,
 * which daily_wellness_rollup uses to split days at local midnight.
 * Runs once per browser session and writes only when the value differs.
 * Best effort: a failure just leaves the previous zone in place.
 */
export function TimezoneSync() {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    try {
      if (sessionStorage.getItem(SYNCED_KEY) === tz) return
    } catch {
      /* storage unavailable: just sync */
    }

    const supabase = createClient()
    ;(async () => {
      // getSession reads the local session (no network); RLS still limits the update to this user.
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) return
      const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', userId).neq('timezone', tz)
      if (error) return
      try {
        sessionStorage.setItem(SYNCED_KEY, tz)
      } catch {
        /* fine: it will just check again next load */
      }
    })()
  }, [])

  return null
}
