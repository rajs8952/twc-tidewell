import type { SupabaseClient } from '@supabase/supabase-js'
import { BEVERAGES, type BeverageId } from './hydration'
import type { DrinkLog, Profile } from './types'

function toProfile(r: any): Profile {
  return {
    id: r.id,
    full_name: r.full_name ?? '',
    avatar_url: r.avatar_url ?? null,
    weight_kg: Number(r.weight_kg),
    gender: r.gender,
    activity_level: r.activity_level,
    custom_goal_ml: r.custom_goal_ml == null ? null : Number(r.custom_goal_ml),
    // Undefined (not null) before supabase/profile.sql has been run.
    height_cm: r.height_cm == null ? null : Number(r.height_cm),
    birth_year: r.birth_year == null ? null : Number(r.birth_year),
  }
}

function toLog(r: any): DrinkLog {
  return {
    id: r.id,
    beverage: r.beverage,
    amount_ml: Number(r.amount_ml),
    multiplier: Number(r.multiplier),
    effective_ml: Number(r.effective_ml),
    logged_at: r.logged_at,
  }
}

export async function getProfile(supabase: SupabaseClient): Promise<Profile> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) throw new Error('You’re signed out. Log in again to continue.')

  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (data) return toProfile(data)

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
  return toProfile(created)
}

export async function updateProfile(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Omit<Profile, 'id'>>,
): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').single()
  // PGRST204: a column in the patch doesn't exist, i.e. profile.sql hasn't been run.
  if (error?.code === 'PGRST204') throw new Error('Height and age aren’t set up yet. Run supabase/profile.sql in Supabase first.')
  if (error) throw error
  return toProfile(data)
}

export async function getLogsBetween(supabase: SupabaseClient, from: Date, to: Date): Promise<DrinkLog[]> {
  const { data, error } = await supabase
    .from('drink_logs')
    .select('id, beverage, amount_ml, multiplier, effective_ml, logged_at')
    .gte('logged_at', from.toISOString())
    .lt('logged_at', to.toISOString())
    .order('logged_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data ?? []).map(toLog)
}

export async function addLog(supabase: SupabaseClient, beverage: BeverageId, amountMl: number): Promise<DrinkLog> {
  const { data, error } = await supabase
    .from('drink_logs')
    .insert({ beverage, amount_ml: Math.round(amountMl), multiplier: BEVERAGES[beverage].multiplier })
    .select('id, beverage, amount_ml, multiplier, effective_ml, logged_at')
    .single()
  if (error) throw error
  return toLog(data)
}

export async function deleteLog(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from('drink_logs').delete().eq('id', id)
  if (error) throw error
}

/** Map of 'YYYY-MM-DD' → effective ml, computed in the browser's timezone. */
export async function getDailyTotals(supabase: SupabaseClient, days = 400): Promise<Record<string, number>> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const { data, error } = await supabase.rpc('daily_totals', { p_tz: tz, p_days: days })
  if (error) throw error
  const out: Record<string, number> = {}
  for (const row of (data ?? []) as { day: string; total_ml: number | string }[]) {
    out[row.day] = Number(row.total_ml)
  }
  return out
}
