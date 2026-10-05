/* ------------------------------------------------------------------
 * The three insight metrics: labels, colours, formatting, and how each
 * day's values are lined up for a pair (the same pairing the Spearman
 * correlations use, so charts and insights always agree).
 * ------------------------------------------------------------------ */

import type { InsightDay } from './analyze'

export type Metric = 'water' | 'sleep' | 'mood'

export const METRIC_ORDER: Metric[] = ['water', 'sleep', 'mood']

/** Colours validated together (dataviz palette check, light surface). */
export const METRIC_META: Record<Metric, { label: string; color: string }> = {
  water: { label: 'Water', color: '#2189D6' },
  // Not the Sleep tracker's indigo: beside water blue it fails the normal-vision ΔE floor.
  sleep: { label: 'Sleep', color: '#8B5CF6' },
  mood: { label: 'Mood', color: '#E8628A' },
}

/** Fewer overlapping days than this and no insight or chart is shown. */
export const MIN_OVERLAP_DAYS = 7

/**
 * One value per day for `metric`, aligned for comparison with `other`.
 * A day's sleep_minutes is the night that ENDED that morning, so next to
 * water it shows the night AFTER each day (the night that water could affect).
 */
export function seriesFor(metric: Metric, other: Metric, days: InsightDay[]): (number | null)[] {
  if (metric === 'water') return days.map((d) => d.water_ml)
  if (metric === 'mood') return days.map((d) => d.mood_score)
  return other === 'water' ? days.map((_, i) => days[i + 1]?.sleep_minutes ?? null) : days.map((d) => d.sleep_minutes)
}

/** Days where both series have a value. */
export const overlapDays = (a: (number | null)[], b: (number | null)[]) => a.filter((v, i) => v !== null && b[i] !== null).length

export const metricLabel = (m: Metric, other: Metric) =>
  m !== 'sleep' ? METRIC_META[m].label : other === 'water' ? 'Sleep that night' : 'Sleep the night before'

/** Human-readable value: "2.4 L", "7h 20m", "4.2 / 5". */
export function formatMetric(metric: Metric, v: number) {
  if (metric === 'water') return `${Number((v / 1000).toFixed(1))} L`
  if (metric === 'sleep') return `${Math.floor(v / 60)}h ${String(Math.round(v % 60)).padStart(2, '0')}m`
  return `${Number.isInteger(v) ? v : v.toFixed(1)} / 5`
}

export const shortDate = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
