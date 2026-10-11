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
  /** When the account was created (ISO); used to go easy on brand-new users. */
  created_at?: string | null
  /** Personal goals (supabase/personal-goals.sql); absent before that's run, so use goalsOf(). */
  goal_sleep_min?: number
  goal_meditation_min?: number
  goal_exercise_week_min?: number
  /** Onboarding (supabase/onboarding.sql); absent before that's run. */
  focus_trackers?: string[]
  /** When they finished or skipped the welcome screen; null = not yet. */
  onboarded_at?: string | null
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
