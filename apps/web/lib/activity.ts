'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, computeStreaks, dayKey, parseDayKey, startOfDay, startOfWeek } from '@rajs8952/core/dates'
import { getDailyTotals } from '@rajs8952/storage/supabase'
import type { TrackerId } from './trackers'

/* ------------------------------------------------------------------
 * Streak history for Home: which days each tracker was logged (local
 * time), over the last ~4 months, straight from the browser (row-level
 * security keeps it to the user's own rows). Only the time column is read.
 * ------------------------------------------------------------------ */

const DAYS_BACK = 120

/** Table and time column per tracker (sleep counts on the morning it ended). */
const SOURCES: Record<Exclude<TrackerId, 'water'>, { table: string; column: string }> = {
  mood: { table: 'mood_logs', column: 'logged_at' },
  sleep: { table: 'sleep_logs', column: 'wake_at' },
  meditation: { table: 'meditation_logs', column: 'logged_at' },
  exercise: { table: 'exercise_logs', column: 'logged_at' },
  weight: { table: 'weight_logs', column: 'logged_at' },
}

export interface Activity {
  /** Day keys ('YYYY-MM-DD', local) with at least one entry, per tracker. */
  days: Record<Exclude<TrackerId, 'water'>, Set<string>>
  /** Water: effective ml per local day (for the goal-based streak and the garden). */
  waterTotals: Record<string, number>
}

export async function loadActivity(supabase: SupabaseClient, now = new Date()): Promise<Activity> {
  const since = addDays(startOfDay(now), -DAYS_BACK).toISOString()
  const entries = await Promise.all(
    (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map(async (id) => {
      const { table, column } = SOURCES[id]
      const { data } = await supabase.from(table).select(column).gte(column, since).limit(5000)
      const set = new Set(((data ?? []) as unknown as Record<string, string>[]).map((r) => dayKey(new Date(r[column]!))))
      return [id, set] as const
    }),
  )
  const waterTotals = await getDailyTotals(supabase, DAYS_BACK).catch(() => ({}) as Record<string, number>)
  return { days: Object.fromEntries(entries) as Activity['days'], waterTotals }
}

/** Days in a row with an entry, up to today (today not yet logged doesn't break it). */
export function dayStreak(days: Set<string>, now = new Date()) {
  const totals = Object.fromEntries([...days].map((k) => [k, 1]))
  return computeStreaks(totals, 1, now).current
}

/** Weeks in a row (Monday–Sunday) with an entry; this week not yet logged doesn't break it. */
export function weekStreak(days: Set<string>, now = new Date()) {
  const weeks = new Set([...days].map((k) => dayKey(startOfWeek(parseDayKey(k)))))
  let week = startOfWeek(now)
  if (!weeks.has(dayKey(week))) week = addDays(week, -7)
  let n = 0
  while (weeks.has(dayKey(week))) {
    n++
    week = addDays(week, -7)
  }
  return n
}

/** Water: days in a row reaching the goal (as on the Water page). */
export function waterStreak(totals: Record<string, number>, goal: number, now = new Date()) {
  return computeStreaks(totals, goal || Infinity, now).current
}

/** Days in a row with anything logged at all. */
export function activeStreak(a: Activity, now = new Date()) {
  const all = new Set<string>()
  for (const set of Object.values(a.days)) for (const k of set) all.add(k)
  for (const [k, ml] of Object.entries(a.waterTotals)) if (ml > 0) all.add(k)
  return dayStreak(all, now)
}
