/* Where each tracker's entries live in Supabase; read by fetchRange (./queries.ts). */

import { toExerciseLog, type ExerciseLog } from '@omniwell/core/exercise'
import type { MeditationLog } from '@omniwell/core/meditation'
import type { MoodLog } from '@omniwell/core/mood'
import type { SleepLog } from '@omniwell/core/sleep'
import { toWeightLog, type WeightLog } from '@omniwell/core/weight'

/** How a tracker's entries are listed over a date range (see ./queries.ts). */
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
