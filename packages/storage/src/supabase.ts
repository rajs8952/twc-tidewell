/* ------------------------------------------------------------------
 * OmniWell's Supabase schema (supabase/*.sql) as TrackerStorage, plus the
 * table descriptions and queries the OmniWell server actions share.
 * Queries run as whoever the client is signed in as; row-level security
 * limits every table to the user's own rows.
 * ------------------------------------------------------------------ */

import type { SupabaseClient } from '@supabase/supabase-js'
import { validateExerciseInput, toExerciseLog, type ExerciseLog } from '@rajs8952/core/exercise'
import { BEVERAGES, type BeverageId } from '@rajs8952/core/hydration'
import { validateMeditationInput, type MeditationLog } from '@rajs8952/core/meditation'
import { validateMoodInput, type MoodLog } from '@rajs8952/core/mood'
import { validateSleepInput, type SleepLog } from '@rajs8952/core/sleep'
import type { LogStore, TrackerStorage } from '@rajs8952/core/storage'
import type { ActionResult, DateRange, DrinkLog, Profile } from '@rajs8952/core/types'
import { toWeightLog, validateWeightInput, type WeightLog } from '@rajs8952/core/weight'

/** How a tracker's entries are listed over a date range (see fetchRange). */
export interface RangeQuery<T> {
  /** Display name, used in "<name> tracking isn’t set up yet" errors. */
  name: string
  table: string
  columns: string
  /** Column the range filters and sorts on (newest first). */
  timeColumn: string
  /** Normalises a raw row, e.g. numeric columns that arrive as strings. */
  map?: (row: Record<string, unknown>) => T
}

/** How mood entries are listed; shared by the Mood server action and the dashboard loader. */
export const MOOD_QUERY: RangeQuery<MoodLog> = {
  name: 'Mood',
  table: 'mood_logs',
  columns: 'id, mood_state, energy_level, stress_level, emotions, note, logged_at',
  timeColumn: 'logged_at',
}

/** How sleep entries are listed; shared by the Sleep server action and the dashboard loader. */
export const SLEEP_QUERY: RangeQuery<SleepLog> = {
  name: 'Sleep',
  table: 'sleep_logs',
  columns: 'id, bed_at, wake_at, duration_min, quality, awakenings, note, logged_at',
  timeColumn: 'wake_at',
}

/** How weight entries are listed; shared by the Weight server action and the dashboard loader. */
export const WEIGHT_QUERY: RangeQuery<WeightLog> = {
  name: 'Weight',
  table: 'weight_logs',
  columns: 'id, weight_kg, body_fat_pct, note, logged_at',
  timeColumn: 'logged_at',
  map: toWeightLog,
}

/** How exercise entries are listed; shared by the Exercise server action and the dashboard loader. */
export const EXERCISE_QUERY: RangeQuery<ExerciseLog> = {
  name: 'Exercise',
  table: 'exercise_logs',
  columns: 'id, activity, duration_min, intensity, calories_kcal, distance_km, note, logged_at',
  timeColumn: 'logged_at',
  map: toExerciseLog,
}

/** How meditation entries are listed; shared by the Meditation server action and the dashboard loader. */
export const MEDITATION_QUERY: RangeQuery<MeditationLog> = {
  name: 'Meditation',
  table: 'meditation_logs',
  columns: 'id, duration_min, session_type, calm_before, calm_after, note, logged_at',
  timeColumn: 'logged_at',
}

/** PostgREST's "table not found" (PGRST205) means wellness.sql hasn't been run on this project. */
export function friendlyDbError(e: { code?: string; message: string }, tracker: string) {
  return e.code === 'PGRST205' ? `${tracker} tracking isn’t set up yet. Run supabase/wellness.sql in Supabase first.` : e.message
}

const isIso = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s))
const isUuid = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)

/**
 * Lists a tracker's entries whose timeColumn falls in [from, to), newest
 * first. Shared by each tracker's list and OmniWell's dashboard loader, so
 * both always return the same shape.
 */
export async function fetchRange<T>(supabase: SupabaseClient, q: RangeQuery<T>, range: DateRange): Promise<ActionResult<T[]>> {
  if (!isIso(range?.from) || !isIso(range?.to)) return { ok: false, error: 'Invalid date range.' }

  const { data, error } = await supabase
    .from(q.table)
    .select(q.columns)
    .gte(q.timeColumn, range.from)
    .lt(q.timeColumn, range.to)
    .order(q.timeColumn, { ascending: false })
    .limit(500)
  if (error) return { ok: false, error: friendlyDbError(error, q.name) }

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return { ok: true, data: q.map ? rows.map(q.map) : (rows as T[]) }
}

/* ---------- Drinks ---------- */

const DRINK_COLUMNS = 'id, beverage, amount_ml, multiplier, effective_ml, logged_at'

export function toDrinkLog(r: Record<string, unknown>): DrinkLog {
  return {
    id: r.id as string,
    beverage: r.beverage as BeverageId,
    amount_ml: Number(r.amount_ml),
    multiplier: Number(r.multiplier),
    effective_ml: Number(r.effective_ml),
    logged_at: r.logged_at as string,
  }
}

export async function getDrinkLogs(supabase: SupabaseClient, from: Date, to: Date): Promise<DrinkLog[]> {
  const { data, error } = await supabase
    .from('drink_logs')
    .select(DRINK_COLUMNS)
    .gte('logged_at', from.toISOString())
    .lt('logged_at', to.toISOString())
    .order('logged_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  return (data ?? []).map(toDrinkLog)
}

export async function addDrinkLog(supabase: SupabaseClient, beverage: BeverageId, amountMl: number): Promise<DrinkLog> {
  const { data, error } = await supabase
    .from('drink_logs')
    .insert({ beverage, amount_ml: Math.round(amountMl), multiplier: BEVERAGES[beverage].multiplier })
    .select(DRINK_COLUMNS)
    .single()
  if (error) throw error
  return toDrinkLog(data)
}

export async function deleteDrinkLog(supabase: SupabaseClient, id: string) {
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

/* ---------- Profile ---------- */

export function toProfile(r: Record<string, unknown>): Profile {
  return {
    id: r.id as string,
    full_name: (r.full_name as string | null) ?? '',
    avatar_url: (r.avatar_url as string | null) ?? null,
    weight_kg: Number(r.weight_kg),
    gender: r.gender as Profile['gender'],
    activity_level: r.activity_level as Profile['activity_level'],
    custom_goal_ml: r.custom_goal_ml == null ? null : Number(r.custom_goal_ml),
    // Undefined (not null) before supabase/profile.sql has been run.
    height_cm: r.height_cm == null ? null : Number(r.height_cm),
    birth_year: r.birth_year == null ? null : Number(r.birth_year),
  }
}

export async function updateProfileRow(supabase: SupabaseClient, id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', id).select('*').single()
  // PGRST204: a column in the patch doesn't exist, i.e. profile.sql hasn't been run.
  if (error?.code === 'PGRST204') throw new Error('Height and age aren’t set up yet. Run supabase/profile.sql in Supabase first.')
  if (error) throw error
  return toProfile(data)
}

/* ---------- TrackerStorage ---------- */

const SIGNED_OUT = 'You’re signed out. Log in again to continue.'

/**
 * TrackerStorage that talks to Supabase straight from the browser, for apps
 * on the OmniWell schema. (The OmniWell app itself saves wellness logs
 * through server actions; this is the same queries without a server.)
 */
export function createSupabaseStorage(supabase: SupabaseClient): TrackerStorage {
  async function userId() {
    const { data } = await supabase.auth.getUser()
    return data.user?.id ?? null
  }

  function logStore<TLog, TInput, TRow extends object>(
    q: RangeQuery<TLog>,
    validate: (input: unknown) => { ok: true; value: TRow } | { ok: false; error: string },
  ): LogStore<TLog, TInput> {
    const map = q.map ?? ((r: Record<string, unknown>) => r as TLog)
    return {
      list: (range) => fetchRange(supabase, q, range),
      async create(input) {
        const parsed = validate(input)
        if (!parsed.ok) return parsed
        const { data, error } = await supabase.from(q.table).insert(parsed.value).select(q.columns).single()
        if (error) return { ok: false, error: friendlyDbError(error, q.name) }
        return { ok: true, data: map(data as unknown as Record<string, unknown>) }
      },
      async remove(id) {
        if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }
        const { error } = await supabase.from(q.table).delete().eq('id', id)
        if (error) return { ok: false, error: friendlyDbError(error, q.name) }
        return { ok: true, data: null }
      },
    }
  }

  const weightRows = logStore(WEIGHT_QUERY, (input) => {
    const parsed = validateWeightInput(input)
    if (!parsed.ok) return parsed
    const { sync_profile: _sync, ...row } = parsed.value
    return { ok: true, value: row }
  })

  return {
    mood: logStore(MOOD_QUERY, validateMoodInput),
    sleep: logStore(SLEEP_QUERY, validateSleepInput),
    exercise: logStore(EXERCISE_QUERY, validateExerciseInput),
    meditation: logStore(MEDITATION_QUERY, validateMeditationInput),
    weight: {
      list: weightRows.list,
      remove: weightRows.remove,
      // Like OmniWell's server action: optionally copies the weight to the profile; a failure there keeps the entry.
      async create(input) {
        const parsed = validateWeightInput(input)
        if (!parsed.ok) return parsed
        const saved = await weightRows.create(input)
        if (!saved.ok) return saved
        let profileSynced = false
        if (parsed.value.sync_profile) {
          const id = await userId()
          if (id) profileSynced = !(await supabase.from('profiles').update({ weight_kg: parsed.value.weight_kg }).eq('id', id)).error
        }
        return { ok: true, data: { log: saved.data, profileSynced } }
      },
    },
    water: {
      list: (from, to) => getDrinkLogs(supabase, from, to),
      add: (beverage, ml) => addDrinkLog(supabase, beverage, ml),
      remove: (id) => deleteDrinkLog(supabase, id),
      dailyTotals: (days) => getDailyTotals(supabase, days),
    },
    profile: {
      async get() {
        const id = await userId()
        if (!id) throw new Error(SIGNED_OUT)
        const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single()
        if (error) throw error
        return toProfile(data)
      },
      update: (id, patch) => updateProfileRow(supabase, id, patch),
    },
  }
}
