/* ------------------------------------------------------------------
 * Exercise tracker: shared constants, types, validation and helpers.
 * Used by both the server actions and the client UI.
 * ------------------------------------------------------------------ */

import { addDays, startOfDay, startOfWeek } from './hydration'
import type { DateRange, RangeQuery } from './types'

export type { ActionResult, DateRange } from './types'

export type ActivityId = 'walking' | 'running' | 'cycling' | 'swimming' | 'strength' | 'yoga' | 'hiit' | 'sports' | 'other'
export type Intensity = 'light' | 'moderate' | 'vigorous'

/**
 * met: approximate MET values for light / moderate / vigorous effort,
 * after the Compendium of Physical Activities. Used only for the calorie estimate.
 */
export const ACTIVITIES: { id: ActivityId; label: string; distance: boolean; met: [number, number, number] }[] = [
  { id: 'walking', label: 'Walking', distance: true, met: [2.8, 3.5, 5.0] },
  { id: 'running', label: 'Running', distance: true, met: [7.0, 9.8, 11.5] },
  { id: 'cycling', label: 'Cycling', distance: true, met: [4.0, 6.8, 10.0] },
  { id: 'swimming', label: 'Swimming', distance: true, met: [5.0, 7.0, 9.8] },
  { id: 'strength', label: 'Strength', distance: false, met: [3.5, 5.0, 6.0] },
  { id: 'yoga', label: 'Yoga', distance: false, met: [2.5, 3.0, 4.0] },
  { id: 'hiit', label: 'HIIT', distance: false, met: [6.0, 8.0, 10.0] },
  { id: 'sports', label: 'Sports', distance: false, met: [4.0, 6.0, 8.0] },
  { id: 'other', label: 'Other', distance: false, met: [3.0, 4.5, 6.0] },
]

export const ACTIVITY_BY_ID = Object.fromEntries(ACTIVITIES.map((a) => [a.id, a])) as Record<ActivityId, (typeof ACTIVITIES)[number]>

export const INTENSITIES: { id: Intensity; label: string; hint: string }[] = [
  { id: 'light', label: 'Light', hint: 'Easy pace, you can sing.' },
  { id: 'moderate', label: 'Moderate', hint: 'You can talk, but not sing.' },
  { id: 'vigorous', label: 'Vigorous', hint: 'Only a few words at a time.' },
]

export const DURATIONS = [10, 20, 30, 45, 60, 90]
export const MAX_MINUTES = 1440

/** WHO guideline for adults: 150 minutes of moderate activity a week. */
export const WEEKLY_TARGET_MIN = 150

export interface ExerciseLog {
  id: string
  activity: ActivityId
  duration_min: number
  intensity: Intensity
  calories_kcal: number | null
  distance_km: number | null
  note: string | null
  logged_at: string
}

export interface ExerciseInput {
  activity: ActivityId
  duration_min: number
  intensity: Intensity
  calories_kcal?: number | null
  distance_km?: number | null
  note?: string | null
}

/** kcal ≈ MET × body weight (kg) × hours. */
export function estimateKcal(activity: ActivityId, intensity: Intensity, minutes: number, weightKg: number) {
  const idx = INTENSITIES.findIndex((i) => i.id === intensity)
  const met = ACTIVITY_BY_ID[activity].met[Math.max(idx, 0)]
  return Math.round(met * weightKg * (minutes / 60))
}

/** Supabase returns numeric columns as strings; normalise a row. */
export function toExerciseLog(r: Record<string, unknown>): ExerciseLog {
  return {
    id: r.id as string,
    activity: r.activity as ActivityId,
    duration_min: Number(r.duration_min),
    intensity: r.intensity as Intensity,
    calories_kcal: r.calories_kcal == null ? null : Number(r.calories_kcal),
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
    note: (r.note as string | null) ?? null,
    logged_at: r.logged_at as string,
  }
}

/** Mirrors the CHECK constraints on exercise_logs in supabase/wellness.sql. */
export function validateExerciseInput(input: unknown): { ok: true; value: ExerciseInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing workout details.' }
  const i = input as Record<string, unknown>

  if (!ACTIVITIES.some((a) => a.id === i.activity)) return { ok: false, error: 'Pick an activity.' }
  if (!Number.isInteger(i.duration_min) || (i.duration_min as number) < 1 || (i.duration_min as number) > MAX_MINUTES) {
    return { ok: false, error: `Duration must be between 1 and ${MAX_MINUTES} minutes.` }
  }
  if (!INTENSITIES.some((x) => x.id === i.intensity)) return { ok: false, error: 'Pick an intensity.' }

  const kcal = i.calories_kcal ?? null
  if (kcal !== null && (!Number.isInteger(kcal) || (kcal as number) < 0 || (kcal as number) > 10000)) {
    return { ok: false, error: 'Calories must be a whole number between 0 and 10,000.' }
  }

  let km: number | null = null
  if (i.distance_km != null) {
    km = typeof i.distance_km === 'number' ? Math.round(i.distance_km * 100) / 100 : NaN
    if (!Number.isFinite(km) || km < 0 || km > 1000) return { ok: false, error: 'Distance must be between 0 and 1,000 km.' }
  }

  const note = typeof i.note === 'string' ? i.note.trim() : null
  if (note && note.length > 1000) return { ok: false, error: 'Notes can be up to 1,000 characters.' }

  return {
    ok: true,
    value: {
      activity: i.activity as ActivityId,
      duration_min: i.duration_min as number,
      intensity: i.intensity as Intensity,
      calories_kcal: kcal as number | null,
      distance_km: km,
      note: note || null,
    },
  }
}

/** "45 min", "1 h 30 min". */
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** How exercise entries are listed; shared by the Exercise server action and the dashboard loader. */
export const EXERCISE_QUERY: RangeQuery<ExerciseLog> = {
  name: 'Exercise',
  table: 'exercise_logs',
  columns: 'id, activity, duration_min, intensity, calories_kcal, distance_km, note, logged_at',
  timeColumn: 'logged_at',
  map: toExerciseLog,
}

/** What the Exercise card shows: last week and this week, so a Monday isn't empty. */
export const exerciseRange = (now = new Date()): DateRange => ({
  from: addDays(startOfWeek(now), -7).toISOString(),
  to: addDays(startOfDay(now), 1).toISOString(),
})
