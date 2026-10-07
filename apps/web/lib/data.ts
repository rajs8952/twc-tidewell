/* OmniWell's profile loader: the shared Supabase queries live in @rajs8952/storage/supabase. */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@rajs8952/core/types'
import { toProfile } from '@rajs8952/storage/supabase'

export async function getProfile(supabase: SupabaseClient): Promise<Profile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('You’re signed out. Log in again to continue.')

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return backfillHeight(supabase, toProfile(data), user.user_metadata)

  // Fallback if the sign-up trigger wasn't installed: create the row from metadata.
  // ON CONFLICT DO NOTHING, since concurrent loads (e.g. Strict Mode) can race here.
  const meta = user.user_metadata ?? {}
  const { error: createError } = await supabase.from('profiles').upsert(
    {
      id: user.id,
      full_name: meta.full_name ?? '',
      weight_kg: meta.weight_kg ?? 70,
      gender: meta.gender ?? 'unspecified',
      activity_level: meta.activity_level ?? 'moderate',
    },
    { onConflict: 'id', ignoreDuplicates: true },
  )
  if (createError) throw createError
  const { data: created, error: reloadError } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (reloadError) throw reloadError
  return backfillHeight(supabase, toProfile(created), meta)
}

/**
 * Height is asked for at sign-up but the database's sign-up trigger
 * (schema.sql) only copies name, weight, sex and activity. The first time
 * the profile loads without a height, copy it from the sign-up details.
 * Best effort: if it fails, the user can still add it in Profile.
 */
async function backfillHeight(supabase: SupabaseClient, profile: Profile, meta: Record<string, unknown> | undefined): Promise<Profile> {
  const h = Number(meta?.height_cm)
  if (profile.height_cm != null || !(h >= 100 && h <= 250)) return profile
  const { data, error } = await supabase.from('profiles').update({ height_cm: Math.round(h * 10) / 10 }).eq('id', profile.id).select('*').single()
  if (error || !data) return profile
  // Copied once only: if they clear their height later, it mustn't come back.
  await supabase.auth.updateUser({ data: { height_cm: null } }).catch(() => {})
  return toProfile(data)
}
