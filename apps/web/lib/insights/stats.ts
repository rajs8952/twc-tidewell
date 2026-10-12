/* ------------------------------------------------------------------
 * "Your last 30 days": plain statistics for all six trackers, plus
 * "habits that go together" comparisons (exercise and meditation days
 * against mood and sleep). Unlike the correlations, these work from the
 * second entry: an average needs two numbers, not thirty days.
 *
 * Entries come straight from the browser (row-level security keeps them
 * to the user's own); everything below the loader is pure.
 * ------------------------------------------------------------------ */

import type { SupabaseClient } from '@supabase/supabase-js'
import { addDays, dayKey, startOfDay } from '@rajs8952/core/dates'
import { ACTIVITY_BY_ID, type ActivityId } from '@rajs8952/core/exercise'
import type { Goals } from '@rajs8952/core/goals'
import { SESSION_BY_ID, type SessionType } from '@rajs8952/core/meditation'
import { MOOD_BY_ID, MOODS, type MoodState } from '@rajs8952/core/mood'
import { getDailyTotals } from '@rajs8952/storage/supabase'

export const STATS_DAYS = 30

export interface StatsEntries {
  mood: { mood_state: MoodState; stress_level: number | null; emotions: string[]; logged_at: string }[]
  sleep: { duration_min: number; quality: number; wake_at: string }[]
  meditation: { duration_min: number; session_type: SessionType; calm_before: number | null; calm_after: number | null; logged_at: string }[]
  exercise: { duration_min: number; activity: ActivityId; logged_at: string }[]
  weight: { weight_kg: number; logged_at: string }[]
  /** Effective water ml per local day ('YYYY-MM-DD'). */
  water: Record<string, number>
}

/** The last `span` local days, today included. */
export async function loadStats(supabase: SupabaseClient, now = new Date(), span = STATS_DAYS): Promise<StatsEntries> {
  const from = addDays(startOfDay(now), -(span - 1)).toISOString()
  const get = async <T,>(table: string, cols: string, timeCol = 'logged_at') => {
    const { data } = await supabase.from(table).select(cols).gte(timeCol, from).order(timeCol, { ascending: true }).limit(3000)
    return (data ?? []) as unknown as T[]
  }
  const [mood, sleep, meditation, exercise, weight, water] = await Promise.all([
    get<StatsEntries['mood'][number]>('mood_logs', 'mood_state, stress_level, emotions, logged_at'),
    get<StatsEntries['sleep'][number]>('sleep_logs', 'duration_min, quality, wake_at', 'wake_at'),
    get<StatsEntries['meditation'][number]>('meditation_logs', 'duration_min, session_type, calm_before, calm_after, logged_at'),
    get<StatsEntries['exercise'][number]>('exercise_logs', 'duration_min, activity, logged_at'),
    get<StatsEntries['weight'][number]>('weight_logs', 'weight_kg, logged_at'),
    getDailyTotals(supabase, span).catch(() => ({}) as Record<string, number>),
  ])
  return { mood, sleep, meditation, exercise, weight: weight.map((w) => ({ ...w, weight_kg: Number(w.weight_kg) })), water }
}

/* ---------- Results ---------- */

export interface Best {
  date: string
  value: number
}

export interface TrackerStats {
  water: { days: number; avgMl: number; goalDays: number; best: Best } | null
  sleep: { nights: number; avgMin: number | null; avgQuality: number | null; goalNights: number; longest: Best } | null
  mood: {
    checkIns: number
    days: number
    avgScore: number | null
    /** The mood logged most often (ties: the better one). */
    common: MoodState
    topEmotions: string[]
    avgStress: number | null
    /** Weekday with the best average mood, once there's enough to say (7+ days over 3+ weekdays). */
    bestWeekday: string | null
  } | null
  exercise: { sessions: number; totalMin: number; avgWeekMin: number; favourite: string; longest: Best } | null
  meditation: {
    sessions: number
    totalMin: number
    avgMin: number
    favourite: string
    /** Average calm before → after, over sessions with both (1–5). */
    calm: { before: number; after: number; sessions: number } | null
  } | null
  weight: { entries: number; latest: number; first: number; change: number | null; low: number; high: number } | null
}

export interface Together {
  id: 'exercise-mood' | 'exercise-sleep' | 'meditation-mood' | 'meditation-stress'
  /** Plain-English finding, e.g. "Your mood was higher on days you exercised." */
  sentence: string
  /** The two averages being compared, already in words. */
  withLabel: string
  withValue: string
  withoutLabel: string
  withoutValue: string
  /** A number behind the words (mood: "3.8 of 5"). */
  withDetail?: string
  withoutDetail?: string
  /** Days on each side. */
  nWith: number
  nWithout: number
  /** Fewer than 10 days in all: worth noticing, not yet a pattern. */
  early: boolean
}

export interface StatsResult {
  span: number
  /** Days in the window with anything logged. */
  activeDays: number
  trackers: TrackerStats
  together: Together[]
}

/* ---------- Helpers ---------- */

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']

export const fmtMin = (m: number) => {
  const r = Math.round(m)
  return r >= 60 ? `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, '0')}m` : `${r} min`
}

export const moodWord = (score: number) => MOODS[Math.min(5, Math.max(1, Math.round(score))) - 1]!.label

/** The key that occurs most often (ties: the earliest in `order`). */
function mostCommon<K extends string>(keys: K[], order: readonly K[]): K {
  const n = new Map<K, number>()
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]))[0]![0]
}

function best(byDay: Map<string, number>): Best {
  let out: Best = { date: '', value: -Infinity }
  for (const [date, value] of byDay) if (value > out.value) out = { date, value }
  return out
}

/** Sum per local day. */
function perDay<T>(rows: T[], at: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = dayKey(new Date(at(r)))
    m.set(k, (m.get(k) ?? 0) + value(r))
  }
  return m
}

/* ---------- The computation ---------- */

export function computeStats(e: StatsEntries, waterGoal: number, goals: Goals, now = new Date(), span = STATS_DAYS): StatsResult {
  const first = addDays(startOfDay(now), -(span - 1))
  const days = Array.from({ length: span }, (_, i) => dayKey(addDays(first, i)))
  const inWindow = new Set(days)
  const within = <T,>(rows: T[], at: (r: T) => string) => rows.filter((r) => inWindow.has(dayKey(new Date(at(r)))))

  const mood = within(e.mood, (m) => m.logged_at)
  const sleep = within(e.sleep, (s) => s.wake_at)
  const meditation = within(e.meditation, (m) => m.logged_at)
  const exercise = within(e.exercise, (x) => x.logged_at)
  const weight = within(e.weight, (w) => w.logged_at).sort((a, b) => a.logged_at.localeCompare(b.logged_at))
  const water = new Map(days.filter((k) => (e.water[k] ?? 0) > 0).map((k) => [k, e.water[k]!]))

  // Mood per day (that day's average score and stress).
  const moodByDay = new Map<string, { scores: number[]; stress: number[] }>()
  for (const m of mood) {
    const k = dayKey(new Date(m.logged_at))
    const d = moodByDay.get(k) ?? { scores: [], stress: [] }
    d.scores.push(MOOD_BY_ID[m.mood_state]?.score ?? 3)
    if (typeof m.stress_level === 'number') d.stress.push(m.stress_level)
    moodByDay.set(k, d)
  }
  const moodScore = new Map([...moodByDay].map(([k, d]) => [k, mean(d.scores)!]))
  const stressScore = new Map([...moodByDay].filter(([, d]) => d.stress.length).map(([k, d]) => [k, mean(d.stress)!]))

  const sleepByDay = perDay(sleep, (s) => s.wake_at, (s) => s.duration_min)
  const exerciseByDay = perDay(exercise, (x) => x.logged_at, (x) => x.duration_min)
  const meditationByDay = perDay(meditation, (m) => m.logged_at, (m) => m.duration_min)

  // Best weekday for mood, once there are 7+ mood days over 3+ different weekdays.
  let bestWeekday: string | null = null
  if (moodScore.size >= 7) {
    const byWeekday = new Map<number, number[]>()
    for (const [k, s] of moodScore) {
      const wd = new Date(`${k}T12:00:00`).getDay()
      byWeekday.set(wd, [...(byWeekday.get(wd) ?? []), s])
    }
    if (byWeekday.size >= 3) {
      const ranked = [...byWeekday].map(([wd, s]) => [wd, mean(s)!] as const).sort((a, b) => b[1] - a[1])
      // Only worth saying when the best day clearly stands out.
      if (ranked[0]![1] - (ranked[1]?.[1] ?? 0) >= 0.25) bestWeekday = WEEKDAYS[ranked[0]![0]]!
    }
  }

  const emotionCount = new Map<string, number>()
  for (const m of mood) for (const em of m.emotions ?? []) emotionCount.set(em, (emotionCount.get(em) ?? 0) + 1)

  const calmPairs = meditation.filter((m) => m.calm_before != null && m.calm_after != null)
  const exerciseTotal = exercise.reduce((s, x) => s + x.duration_min, 0)
  const meditationTotal = meditation.reduce((s, x) => s + x.duration_min, 0)

  const trackers: TrackerStats = {
    water: water.size
      ? {
          days: water.size,
          avgMl: Math.round(mean([...water.values()])!),
          goalDays: waterGoal > 0 ? [...water.values()].filter((ml) => ml >= waterGoal).length : 0,
          best: best(water),
        }
      : null,
    sleep: sleep.length
      ? {
          nights: sleep.length,
          avgMin: sleep.length >= 2 ? mean(sleep.map((s) => s.duration_min)) : null,
          avgQuality: sleep.length >= 2 ? mean(sleep.map((s) => s.quality)) : null,
          goalNights: [...sleepByDay.values()].filter((m) => m >= goals.sleepMin).length,
          longest: best(sleepByDay),
        }
      : null,
    mood: mood.length
      ? {
          checkIns: mood.length,
          days: moodScore.size,
          avgScore: mood.length >= 2 ? mean(mood.map((m) => MOOD_BY_ID[m.mood_state]?.score ?? 3)) : null,
          common: mostCommon(
            mood.map((m) => m.mood_state),
            ['great', 'good', 'okay', 'bad', 'awful'] as const,
          ),
          topEmotions: [...emotionCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([em]) => em),
          avgStress: mean(mood.filter((m) => typeof m.stress_level === 'number').map((m) => m.stress_level!)),
          bestWeekday,
        }
      : null,
    exercise: exercise.length
      ? {
          sessions: exercise.length,
          totalMin: exerciseTotal,
          avgWeekMin: Math.round((exerciseTotal / span) * 7),
          favourite: ACTIVITY_BY_ID[mostCommon(exercise.map((x) => x.activity), Object.keys(ACTIVITY_BY_ID) as ActivityId[])]?.label ?? 'Other',
          longest: best(exerciseByDay),
        }
      : null,
    meditation: meditation.length
      ? {
          sessions: meditation.length,
          totalMin: meditationTotal,
          avgMin: Math.round(meditationTotal / meditation.length),
          favourite: SESSION_BY_ID[mostCommon(meditation.map((m) => m.session_type), Object.keys(SESSION_BY_ID) as SessionType[])]?.label ?? 'Other',
          calm: calmPairs.length
            ? { before: mean(calmPairs.map((m) => m.calm_before!))!, after: mean(calmPairs.map((m) => m.calm_after!))!, sessions: calmPairs.length }
            : null,
        }
      : null,
    weight: weight.length
      ? {
          entries: weight.length,
          latest: weight[weight.length - 1]!.weight_kg,
          first: weight[0]!.weight_kg,
          change: weight.length >= 2 ? Math.round((weight[weight.length - 1]!.weight_kg - weight[0]!.weight_kg) * 10) / 10 : null,
          low: Math.min(...weight.map((w) => w.weight_kg)),
          high: Math.max(...weight.map((w) => w.weight_kg)),
        }
      : null,
  }

  // Habits that go together. Only days where the outcome was logged count, on both sides.
  const together: Together[] = []
  const compare = (
    id: Together['id'],
    habitDays: Map<string, number>,
    outcome: Map<string, number>,
    /** Which day's outcome belongs to habit day k (sleep: the night after, which ends on k + 1). */
    outcomeDay: (k: string) => string,
    describe: (withAvg: number, withoutAvg: number) => Omit<Together, 'id' | 'nWith' | 'nWithout' | 'early'> | null,
  ) => {
    const yes: number[] = []
    const no: number[] = []
    for (const k of days) {
      const o = outcome.get(outcomeDay(k))
      if (o === undefined) continue
      ;(habitDays.has(k) ? yes : no).push(o)
    }
    if (yes.length < 2 || no.length < 2) return
    const d = describe(mean(yes)!, mean(no)!)
    if (d) together.push({ id, ...d, nWith: yes.length, nWithout: no.length, early: yes.length + no.length < 10 })
  }
  const nextDay = (k: string) => dayKey(addDays(new Date(`${k}T12:00:00`), 1))
  const same = (k: string) => k

  const moodFinding = (habit: string) => (w: number, wo: number) => {
    const diff = w - wo
    const sentence =
      diff >= 0.3
        ? `Your mood was better on days you ${habit}.`
        : diff <= -0.3
          ? `Your mood was a little lower on days you ${habit}.`
          : `Your mood was about the same whether or not you ${habit}.`
    return {
      sentence,
      withLabel: `Days you ${habit}`,
      withValue: `Mostly ${moodWord(w).toLowerCase()}`,
      withDetail: `${w.toFixed(1)} of 5`,
      withoutLabel: 'Other days',
      withoutValue: `Mostly ${moodWord(wo).toLowerCase()}`,
      withoutDetail: `${wo.toFixed(1)} of 5`,
    }
  }

  compare('exercise-mood', exerciseByDay, moodScore, same, moodFinding('exercised'))
  compare('exercise-sleep', exerciseByDay, sleepByDay, nextDay, (w, wo) => {
    const diff = Math.round(w - wo)
    return {
      sentence:
        diff >= 10
          ? `You slept ${fmtMin(diff)} longer after days you exercised.`
          : diff <= -10
            ? `You slept ${fmtMin(-diff)} less after days you exercised.`
            : 'You slept about the same after days you exercised.',
      withLabel: 'After exercise',
      withValue: `${fmtMin(w)} a night`,
      withoutLabel: 'Other nights',
      withoutValue: `${fmtMin(wo)} a night`,
    }
  })
  compare('meditation-mood', meditationByDay, moodScore, same, moodFinding('meditated'))
  compare('meditation-stress', meditationByDay, stressScore, same, (w, wo) => {
    const diff = w - wo
    if (Math.abs(diff) < 0.3) return null // "stress about the same" adds nothing next to the mood finding
    return {
      sentence: diff < 0 ? 'Your stress was lower on days you meditated.' : 'Your stress was higher on days you meditated. Maybe you reach for it when you need it most.',
      withLabel: 'Days you meditated',
      withValue: `Stress ${w.toFixed(1)} of 5`,
      withoutLabel: 'Other days',
      withoutValue: `Stress ${wo.toFixed(1)} of 5`,
    }
  })

  const active = new Set<string>([...moodScore.keys(), ...sleepByDay.keys(), ...exerciseByDay.keys(), ...meditationByDay.keys(), ...water.keys()])
  for (const w of weight) active.add(dayKey(new Date(w.logged_at)))

  return { span, activeDays: active.size, trackers, together }
}
