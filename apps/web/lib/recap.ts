'use client'

import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
import type { Goals } from '@rajs8952/core/goals'
import { MOOD_BY_ID, type MoodLog } from '@rajs8952/core/mood'

/* ------------------------------------------------------------------
 * The weekly recap on Home: last week (Monday–Sunday) next to the week
 * before. Entries are loaded with Home's history (loadHistory in
 * lib/activity.ts); the summary is a pure function below.
 * ------------------------------------------------------------------ */

export interface RecentEntries {
  mood: MoodLog[]
  sleep: { duration_min: number; wake_at: string }[]
  meditation: { duration_min: number; logged_at: string }[]
  exercise: { duration_min: number; logged_at: string }[]
  weight: { weight_kg: number; logged_at: string }[]
}

export interface WeekStats {
  waterGoalDays: number
  sleepAvgMin: number | null
  sleepNights: number
  moodAvg: number | null
  checkIns: number
  exerciseMin: number
  meditationMin: number
  /** Latest weigh-in that week. */
  weightKg: number | null
}

export interface Recap {
  /** Monday of last week, 'YYYY-MM-DD' (also the dismiss key). */
  weekOf: string
  last: WeekStats
  prev: WeekStats
  goals: Goals
  headline: string
  /** Anything logged last week at all. */
  hasData: boolean
}

function statsFor(e: RecentEntries, waterTotals: Record<string, number>, waterGoal: number, start: Date): WeekStats {
  const end = addDays(start, 7).getTime()
  const inWeek = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= start.getTime() && t < end
  }
  const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(start, i)))
  const sleep = e.sleep.filter((s) => inWeek(s.wake_at))
  const mood = e.mood.filter((m) => inWeek(m.logged_at))
  const weights = e.weight.filter((w) => inWeek(w.logged_at))
  return {
    waterGoalDays: waterGoal > 0 ? days.filter((k) => (waterTotals[k] ?? 0) >= waterGoal).length : 0,
    sleepAvgMin: sleep.length ? sleep.reduce((s, x) => s + x.duration_min, 0) / sleep.length : null,
    sleepNights: sleep.length,
    moodAvg: mood.length ? mood.reduce((s, m) => s + (MOOD_BY_ID[m.mood_state]?.score ?? 3), 0) / mood.length : null,
    checkIns: mood.length,
    exerciseMin: e.exercise.filter((x) => inWeek(x.logged_at)).reduce((s, x) => s + x.duration_min, 0),
    meditationMin: e.meditation.filter((x) => inWeek(x.logged_at)).reduce((s, x) => s + x.duration_min, 0),
    weightKg: weights[0]?.weight_kg ?? null,
  }
}

/** The one line that leads the recap: the best thing about last week. */
function headlineFor(last: WeekStats, prev: WeekStats, goals: Goals): string {
  if (last.exerciseMin >= goals.exerciseWeekMin) return `You met your exercise goal: ${last.exerciseMin} minutes.`
  if (last.waterGoalDays >= 5) return `You hit your water goal on ${last.waterGoalDays} of 7 days.`
  if (last.sleepAvgMin && prev.sleepAvgMin && last.sleepAvgMin - prev.sleepAvgMin >= 20) return `You slept ${Math.round(last.sleepAvgMin - prev.sleepAvgMin)} minutes more a night than the week before.`
  if (last.moodAvg && prev.moodAvg && last.moodAvg - prev.moodAvg >= 0.5) return 'Your mood was up on the week before.'
  if (last.exerciseMin > prev.exerciseMin && last.exerciseMin > 0) return `More exercise than the week before: ${last.exerciseMin} minutes.`
  if (last.meditationMin > prev.meditationMin && last.meditationMin > 0) return `${last.meditationMin} mindful minutes, up on the week before.`
  return 'Here’s how last week went. Every entry helps you see the pattern.'
}

export function computeRecap(e: RecentEntries, waterTotals: Record<string, number>, waterGoal: number, goals: Goals, now = new Date()): Recap {
  const lastStart = addDays(startOfWeek(now), -7)
  const prevStart = addDays(startOfWeek(now), -14)
  const last = statsFor(e, waterTotals, waterGoal, lastStart)
  const prev = statsFor(e, waterTotals, waterGoal, prevStart)
  const hasData =
    last.checkIns + last.sleepNights > 0 || last.exerciseMin + last.meditationMin > 0 || last.weightKg !== null || Object.keys(waterTotals).some((k) => k >= dayKey(lastStart) && k < dayKey(startOfWeek(now)) && waterTotals[k]! > 0)
  return { weekOf: dayKey(lastStart), last, prev, goals, headline: headlineFor(last, prev, goals), hasData }
}
