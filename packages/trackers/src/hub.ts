/* ------------------------------------------------------------------
 * The Home Hub's at-a-glance summaries: one completion ring per tracker.
 * Pure functions over data the dashboard already loads, so they can be
 * unit-tested. Each "done" definition is a named target below.
 * ------------------------------------------------------------------ */

import { dayKey, startOfWeek } from '@rajs8952/core/dates'
import { DEFAULT_GOALS, type Goals } from '@rajs8952/core/goals'
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

/*
 * Two different questions per tracker:
 *   logged   did you track it? (today; weight: this week). The Home strip counts these.
 *   done     did you reach your goal? (personal goals, @rajs8952/core/goals). The ring and "Goal met".
 * Logging 6.5 h of sleep, or a rest day, is still logging.
 */

/** Defaults; each user's own goals come in through hubSummaries' `goals`. */
export const SLEEP_TARGET_MIN = DEFAULT_GOALS.sleepMin
export const MEDITATION_TARGET_MIN = DEFAULT_GOALS.meditationMin
export const EXERCISE_WEEK_TARGET_MIN = DEFAULT_GOALS.exerciseWeekMin
/** Weight: a weigh-in at least once every 7 days. */
export const WEIGH_IN_EVERY_DAYS = 7

export interface HubSummary {
  id: TrackerId
  /** 0–1 ring fill, or null when the tracker couldn't load. */
  progress: number | null
  /** Tracked today (weight: within the week). */
  logged: boolean
  /** Goal met. */
  done: boolean
  /** Big value in the card, e.g. "1,400 ml", "7h 45m", "Good". */
  value: string
  /** One short line under it, e.g. "of 3,050 ml today". */
  caption: string
}

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`)
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

function failed(id: TrackerId): HubSummary {
  return { id, progress: null, logged: false, done: false, value: '—', caption: 'Couldn’t load right now' }
}

/** Every tracker's summary for `now`, in the user's local day. */
export function hubSummaries(
  data: TrackerData,
  water: { todayMl: number; goalMl: number } | null,
  now = new Date(),
  goals: Goals = DEFAULT_GOALS,
): Record<TrackerId, HubSummary> {
  const today = dayKey(now)
  const isToday = (iso: string) => dayKey(new Date(iso)) === today

  // Water
  const waterSummary: HubSummary = water
    ? {
        id: 'water',
        progress: water.goalMl ? clamp01(water.todayMl / water.goalMl) : 0,
        logged: water.todayMl > 0,
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
      ? { id: 'sleep', progress: clamp01(mins / goals.sleepMin), logged: true, done: mins >= goals.sleepMin, value: fmtMin(mins), caption: `last night · goal ${fmtMin(goals.sleepMin)}` }
      : { id: 'sleep', progress: 0, logged: false, done: false, value: 'Not logged', caption: 'How did you sleep?' }
  }

  // Mood: any check-in today completes it; show the latest.
  let mood: HubSummary = failed('mood')
  if (data.mood.ok) {
    const todays = data.mood.data.filter((l) => isToday(l.logged_at))
    mood = todays.length
      ? {
          id: 'mood',
          progress: 1,
          logged: true,
          done: true,
          value: MOOD_BY_ID[todays[0].mood_state].label,
          caption: `${todays.length} ${todays.length === 1 ? 'check-in' : 'check-ins'} today`,
        }
      : { id: 'mood', progress: 0, logged: false, done: false, value: 'No check-in', caption: 'How are you feeling?' }
  }

  // Meditation
  let meditation: HubSummary = failed('meditation')
  if (data.meditation.ok) {
    const mins = data.meditation.data.filter((l) => isToday(l.logged_at)).reduce((s, l) => s + l.duration_min, 0)
    meditation = {
      id: 'meditation',
      progress: clamp01(mins / goals.meditationMin),
      logged: mins > 0,
      done: mins >= goals.meditationMin,
      value: `${mins} min`,
      caption: `of ${goals.meditationMin} min today`,
    }
  }

  // Exercise: a weekly goal (rest days are fine); "logged" is any workout today.
  let exercise: HubSummary = failed('exercise')
  if (data.exercise.ok) {
    const weekStart = startOfWeek(now).getTime()
    const weekMins = data.exercise.data.filter((l) => new Date(l.logged_at).getTime() >= weekStart).reduce((s, l) => s + l.duration_min, 0)
    exercise = {
      id: 'exercise',
      progress: clamp01(weekMins / goals.exerciseWeekMin),
      logged: data.exercise.data.some((l) => isToday(l.logged_at)),
      done: weekMins >= goals.exerciseWeekMin,
      value: fmtMin(weekMins),
      caption: `of ${goals.exerciseWeekMin} min this week`,
    }
  }

  // Weight: complete while the latest weigh-in is under a week old.
  let weight: HubSummary = failed('weight')
  if (data.weight.ok) {
    const latest = data.weight.data[0]
    if (!latest) {
      weight = { id: 'weight', progress: 0, logged: false, done: false, value: 'No weigh-in', caption: 'Weekly is plenty' }
    } else {
      const daysAgo = Math.round((startOf(now) - startOf(new Date(latest.logged_at))) / 86_400_000)
      const fresh = daysAgo < WEIGH_IN_EVERY_DAYS
      weight = {
        id: 'weight',
        progress: fresh ? 1 : 0,
        logged: fresh,
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
