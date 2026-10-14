'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, computeStreaks, dayKey, parseDayKey, startOfDay, startOfWeek } from '@rajs8952/core/dates'
import { getDailyTotals } from '@rajs8952/storage/supabase'
import type { RecentEntries } from './recap'
import type { TrackerId } from './trackers'

/* ------------------------------------------------------------------
 * Home's history, in one read per tracker (row-level security keeps it to
 * the user's own rows): which days each was logged over the last ~4 months
 * (streaks, the garden), and the last few weeks' entries (the weekly recap
 * and pattern nudges, lib/recap.ts). Water comes as daily totals, which also
 * gives today's total.
 * ------------------------------------------------------------------ */

const DAYS_BACK = 120

/** Table, time column (sleep counts on the morning it ended) and the columns the recap needs. */
const SOURCES = {
  mood: { table: 'mood_logs', column: 'logged_at', cols: 'id, mood_state, energy_level, stress_level, emotions, note, logged_at' },
  sleep: { table: 'sleep_logs', column: 'wake_at', cols: 'duration_min, wake_at' },
  meditation: { table: 'meditation_logs', column: 'logged_at', cols: 'duration_min, logged_at' },
  exercise: { table: 'exercise_logs', column: 'logged_at', cols: 'duration_min, logged_at' },
  weight: { table: 'weight_logs', column: 'logged_at', cols: 'weight_kg, logged_at' },
} satisfies Record<Exclude<TrackerId, 'water'>, { table: string; column: string; cols: string }>

export interface Activity {
  /** Day keys ('YYYY-MM-DD', local) with at least one entry, per tracker. */
  days: Record<Exclude<TrackerId, 'water'>, Set<string>>
  /** Water: effective ml per local day (for the goal-based streak and the garden). */
  waterTotals: Record<string, number>
}

export interface History {
  activity: Activity
  /** From the Monday two weeks before this one: last week, the week before, and the last 7 days. */
  recent: RecentEntries
  /** Today's water (effective ml), or null if it couldn't be loaded. */
  waterToday: number | null
}

export async function loadHistory(supabase: SupabaseClient, now = new Date()): Promise<History> {
  const since = addDays(startOfDay(now), -DAYS_BACK).toISOString()
  const recentFrom = addDays(startOfWeek(now), -14).getTime()
  const ids = Object.keys(SOURCES) as (keyof typeof SOURCES)[]
  const [rows, totals] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        const { table, column, cols } = SOURCES[id]
        const { data } = await supabase.from(table).select(cols).gte(column, since).order(column, { ascending: false }).limit(5000)
        return (data ?? []) as unknown as Record<string, unknown>[]
      }),
    ),
    getDailyTotals(supabase, DAYS_BACK).catch(() => null),
  ])
  const days = {} as Activity['days']
  const recent = {} as Record<keyof typeof SOURCES, Record<string, unknown>[]>
  ids.forEach((id, i) => {
    const at = (r: Record<string, unknown>) => new Date(r[SOURCES[id].column] as string)
    days[id] = new Set(rows[i]!.map((r) => dayKey(at(r))))
    recent[id] = rows[i]!.filter((r) => at(r).getTime() >= recentFrom)
  })
  return {
    activity: { days, waterTotals: totals ?? {} },
    recent: { ...(recent as unknown as RecentEntries), weight: (recent.weight as RecentEntries['weight']).map((w) => ({ ...w, weight_kg: Number(w.weight_kg) })) },
    waterToday: totals ? (totals[dayKey(now)] ?? 0) : null,
  }
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
