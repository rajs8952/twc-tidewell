'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from './supabase/client'

/**
 * A value loaded once per signed-in person and shared by every screen (e.g.
 * their role, asked for by the menu and the profile page alike). Another
 * account signing in on the device loads its own; a failed load is retried
 * next time it's asked for.
 */
export function perUser<T>(load: (supabase: SupabaseClient) => Promise<T>) {
  let owner: string | null | undefined
  let pending: Promise<T> | null = null
  let value: T | undefined

  return {
    /** The value if it's already loaded (for a first render without a loading flash). */
    peek: () => value,
    async get(): Promise<T> {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user.id ?? null
      if (user !== owner) {
        owner = user
        pending = null
        value = undefined
      }
      pending ??= load(supabase).then(
        (v) => {
          if (owner === user) value = v
          return v
        },
        (e) => {
          pending = null
          throw e
        },
      )
      return pending
    },
  }
}
