/* ------------------------------------------------------------------
 * Insights Engine: turns daily_wellness_rollup rows into a gap-free
 * series and Spearman correlations. Pure, so it can be unit-tested.
 * ------------------------------------------------------------------ */

import { toInsight, type Insight } from './describe'
import type { Headline } from './headline'
import { describeStrength, spearman, type SpearmanResult } from './spearman'

export type { Headline, Insight }

export interface InsightDay {
  /** Local calendar day, YYYY-MM-DD, in the user's profile timezone. */
  date: string
  water_ml: number | null
  sleep_minutes: number | null
  mood_score: number | null
}

export interface Correlation extends SpearmanResult {
  id: 'water-next-sleep' | 'sleep-mood' | 'water-mood'
  question: string
  /** How the two series are paired, in plain words. */
  pairing: string
  strength: ReturnType<typeof describeStrength> | null
}

export interface Insights {
  timezone: string
  /** The water goal the A-vs-B split and the chart's goal line use. */
  goalMl: number
  from: string
  to: string
  /** Every day in the window, oldest first; days with no entries are all-null. */
  days: InsightDay[]
  correlations: Correlation[]
  /** One human-readable insight per correlation, same order. */
  insights: Insight[]
  /** The single bold sentence for the top of the screen (see lib/insights/headline.ts). */
  headline: Headline
}

/** A daily_wellness_rollup row as PostgREST returns it. */
export interface RollupRow {
  date: string
  total_water_ml: number | string | null
  total_sleep_minutes: number | string | null
  average_mood_score: number | string | null
}

/** Shift a YYYY-MM-DD date by whole days (pure calendar math, no timezone involved). */
export function shiftDate(ymd: string, days: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

function correlate(id: Correlation['id'], question: string, pairing: string, x: (number | null)[], y: (number | null)[]): Correlation {
  const r = spearman(x, y)
  return { id, question, pairing, ...r, strength: r.rho === null ? null : describeStrength(r.rho) }
}

/** Fills every day from `from` for `span` days, correlates water, sleep and mood, and describes each result. */
export function analyzeRollup(rows: RollupRow[], from: string, span: number): Pick<Insights, 'days' | 'correlations' | 'insights'> {
  // One entry per calendar day, so "the next day" is always index + 1.
  const byDate = new Map(rows.map((r) => [String(r.date), r]))
  const series: InsightDay[] = Array.from({ length: span }, (_, i) => {
    const date = shiftDate(from, i)
    const r = byDate.get(date)
    return {
      date,
      water_ml: num(r?.total_water_ml),
      sleep_minutes: num(r?.total_sleep_minutes),
      mood_score: num(r?.average_mood_score),
    }
  })

  const water = series.map((d) => d.water_ml)
  const sleep = series.map((d) => d.sleep_minutes)
  const mood = series.map((d) => d.mood_score)
  // A day's sleep_minutes is the night that ENDED that morning, so a day's water
  // affects the NEXT day's sleep value: pair water[i] with sleep[i + 1].
  const nextNightSleep = [...sleep.slice(1), null]

  const correlations = [
    correlate(
      'water-next-sleep',
      'Does more water mean more sleep?',
      'Each day’s water against the night that follows it.',
      water,
      nextNightSleep,
    ),
    correlate('sleep-mood', 'Does more sleep mean a better mood?', 'Last night’s sleep against the next day’s mood.', sleep, mood),
    correlate('water-mood', 'Does more water mean a better mood?', 'Each day’s water against that day’s mood.', water, mood),
  ]

  return { days: series, correlations, insights: correlations.map(toInsight) }
}
