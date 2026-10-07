import type { Activity, BeverageId, Gender } from './hydration'

export interface Profile {
  id: string
  full_name: string
  avatar_url: string | null
  weight_kg: number
  gender: Gender
  activity_level: Activity
  custom_goal_ml: number | null
  /** Null until the user adds it (see supabase/profile.sql). */
  height_cm: number | null
  /** Stored instead of an age so it never goes stale. */
  birth_year: number | null
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

export interface DateRange {
  from: string
  to: string
}
