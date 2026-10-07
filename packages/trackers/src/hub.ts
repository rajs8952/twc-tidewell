/* ------------------------------------------------------------------
 * The Home Hub's at-a-glance summaries: one completion ring per tracker.
 * Pure functions over data the dashboard already loads, so they can be
 * unit-tested. Each "done" definition is a named target below.
 * ------------------------------------------------------------------ */

import { dayKey } from '@rajs8952/core/dates'
import type { ExerciseLog } from '@rajs8952/core/exercise'
import type { MeditationLog } from '@rajs8952/core/meditation'
import { MOOD_BY_ID, type MoodLog } from '@rajs8952/core/mood'
import type { SleepLog } from '@rajs8952/core/sleep'
import type { ActionResult } from '@rajs8952/core/types'
import type { WeightLog } from '@rajs8952/core/weight'
import type { TrackerId } from './registry'

/** Each tracker's first screen of data; one failed load only affects its own card. */
export interface TrackerData {
  mood: ActionResult<MoodLog[]>
  meditation: ActionResult<MeditationLog[]>
  sleep: ActionResult<SleepLog[]>
  weight: ActionResult<WeightLog[]>
  exercise: ActionResult<ExerciseLog[]>
}

/** Sleep: last night counts as complete from 7 h, the bottom of the 7–9 h guide. */
export const SLEEP_TARGET_MIN = 7 * 60
/** Meditation: 10 minutes a day. */
export const MEDITATION_TARGET_MIN = 10
/** Exercise: 30 minutes a day (the WHO's 150 a week, over five days). */
export const EXERCISE_TARGET_MIN = 30
/** Weight: a weigh-in at least once every 7 days. */
export const WEIGH_IN_EVERY_DAYS = 7

export interface HubSummary {
  id: TrackerId
  /** 0–1 ring fill, or null when the tracker couldn't load. */
  progress: number | null
  done: boolean
  /** Big value in the card, e.g. "1,400 ml", "7h 45m", "Good". */
  value: string
  /** One short line under it, e.g. "of 3,050 ml today". */
  caption: string
}

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`)
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

function failed(id: TrackerId): HubSummary {
  return { id, progress: null, done: false, value: '—', caption: 'Couldn’t load right now' }
}

/** Every tracker's summary for `now`, in the user's local day. */
export function hubSummaries(
  data: TrackerData,
  water: { todayMl: number; goalMl: number } | null,
  now = new Date(),
): Record<TrackerId, HubSummary> {
  const today = dayKey(now)
  const isToday = (iso: string) => dayKey(new Date(iso)) === today

  // Water
  const waterSummary: HubSummary = water
    ? {
        id: 'water',
        progress: water.goalMl ? clamp01(water.todayMl / water.goalMl) : 0,
        done: water.goalMl > 0 && water.todayMl >= water.goalMl,
        value: `${water.todayMl.toLocaleString()} ml`,
        caption: `of ${water.goalMl.toLocaleString()} ml today`,
      }
    : failed('water')

  // Sleep: the night(s) that ended this morning.
  let sleep: HubSummary = failed('sleep')
  if (data.sleep.ok) {
    const mins = data.sleep.data.filter((l) => isToday(l.wake_at)).reduce((s, l) => s + l.duration_min, 0)
    sleep = mins
      ? { id: 'sleep', progress: clamp01(mins / SLEEP_TARGET_MIN), done: mins >= SLEEP_TARGET_MIN, value: fmtMin(mins), caption: 'last night' }
      : { id: 'sleep', progress: 0, done: false, value: 'Not logged', caption: 'How did you sleep?' }
  }

  // Mood: any check-in today completes it; show the latest.
  let mood: HubSummary = failed('mood')
  if (data.mood.ok) {
    const todays = data.mood.data.filter((l) => isToday(l.logged_at))
    mood = todays.length
      ? {
          id: 'mood',
          progress: 1,
          done: true,
          value: MOOD_BY_ID[todays[0].mood_state].label,
          caption: `${todays.length} ${todays.length === 1 ? 'check-in' : 'check-ins'} today`,
        }
      : { id: 'mood', progress: 0, done: false, value: 'No check-in', caption: 'How are you feeling?' }
  }

  // Meditation
  let meditation: HubSummary = failed('meditation')
  if (data.meditation.ok) {
    const mins = data.meditation.data.filter((l) => isToday(l.logged_at)).reduce((s, l) => s + l.duration_min, 0)
    meditation = {
      id: 'meditation',
      progress: clamp01(mins / MEDITATION_TARGET_MIN),
      done: mins >= MEDITATION_TARGET_MIN,
      value: `${mins} min`,
      caption: `of ${MEDITATION_TARGET_MIN} min today`,
    }
  }

  // Exercise
  let exercise: HubSummary = failed('exercise')
  if (data.exercise.ok) {
    const mins = data.exercise.data.filter((l) => isToday(l.logged_at)).reduce((s, l) => s + l.duration_min, 0)
    exercise = {
      id: 'exercise',
      progress: clamp01(mins / EXERCISE_TARGET_MIN),
      done: mins >= EXERCISE_TARGET_MIN,
      value: fmtMin(mins),
      caption: `of ${EXERCISE_TARGET_MIN} min today`,
    }
  }

  // Weight: complete while the latest weigh-in is under a week old.
  let weight: HubSummary = failed('weight')
  if (data.weight.ok) {
    const latest = data.weight.data[0]
    if (!latest) {
      weight = { id: 'weight', progress: 0, done: false, value: 'No weigh-in', caption: 'Weekly is plenty' }
    } else {
      const daysAgo = Math.round((startOf(now) - startOf(new Date(latest.logged_at))) / 86_400_000)
      const fresh = daysAgo < WEIGH_IN_EVERY_DAYS
      weight = {
        id: 'weight',
        progress: fresh ? 1 : 0,
        done: fresh,
        value: `${latest.weight_kg.toFixed(1)} kg`,
        caption: daysAgo === 0 ? 'weighed in today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago${fresh ? '' : ' · due'}`,
      }
    }
  }

  return { water: waterSummary, sleep, mood, meditation, exercise, weight }
}

function startOf(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
