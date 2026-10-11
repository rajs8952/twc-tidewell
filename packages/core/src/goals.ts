/* ------------------------------------------------------------------
 * Personal goals: what "goal met" means for each tracker. Employees set
 * their own in Profile (supabase/personal-goals.sql); these defaults are
 * the guidance used before goals were personal.
 * ------------------------------------------------------------------ */

import type { Profile } from './types'

export interface Goals {
  /** Sleep a night, in minutes. */
  sleepMin: number
  /** Meditation a day, in minutes. */
  meditationMin: number
  /** Exercise a week (Monday–Sunday), in minutes. */
  exerciseWeekMin: number
}

export const DEFAULT_GOALS: Goals = { sleepMin: 7 * 60, meditationMin: 10, exerciseWeekMin: 150 }

/** Mirrors the CHECK constraints in supabase/personal-goals.sql. */
export const GOAL_LIMITS = {
  sleepMin: { min: 4 * 60, max: 12 * 60 },
  meditationMin: { min: 1, max: 120 },
  exerciseWeekMin: { min: 30, max: 1500 },
} as const

/** A profile's goals, falling back to the defaults (also before the SQL has been run). */
export function goalsOf(p: Pick<Profile, 'goal_sleep_min' | 'goal_meditation_min' | 'goal_exercise_week_min'> | null | undefined): Goals {
  return {
    sleepMin: p?.goal_sleep_min ?? DEFAULT_GOALS.sleepMin,
    meditationMin: p?.goal_meditation_min ?? DEFAULT_GOALS.meditationMin,
    exerciseWeekMin: p?.goal_exercise_week_min ?? DEFAULT_GOALS.exerciseWeekMin,
  }
}

export function validateGoals(g: Goals): { ok: true } | { ok: false; error: string } {
  const bad = (k: keyof Goals) => !Number.isInteger(g[k]) || g[k] < GOAL_LIMITS[k].min || g[k] > GOAL_LIMITS[k].max
  if (bad('sleepMin')) return { ok: false, error: 'Choose a sleep goal between 4 and 12 hours.' }
  if (bad('meditationMin')) return { ok: false, error: 'Choose a meditation goal between 1 and 120 minutes a day.' }
  if (bad('exerciseWeekMin')) return { ok: false, error: 'Choose an exercise goal between 30 and 1,500 minutes a week.' }
  return { ok: true }
}
