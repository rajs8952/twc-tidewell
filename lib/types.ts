import type { Activity, BeverageId, Gender } from './hydration'

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  weight_kg: number
  gender: Gender
  activity_level: Activity
  custom_goal_ml: number | null
}

export interface DrinkLog {
  id: string
  beverage: BeverageId
  amount_ml: number
  multiplier: number
  effective_ml: number
  logged_at: string
}

/** What every tracker's server action returns: errors come back as values, not throws. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

/** How a tracker's entries are listed over a date range (see lib/supabase/queries.ts). */
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

export interface DateRange {
  from: string
  to: string
}
