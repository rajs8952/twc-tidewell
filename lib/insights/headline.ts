/* ------------------------------------------------------------------
 * The headline insight: one bold, plain-English sentence about the
 * strongest link in the window, with a concrete difference, e.g.
 * "When you hit your water goal, you sleep 45 minutes longer."
 *
 * Spearman says HOW CONSISTENTLY two things move together; the sentence
 * needs HOW MUCH, so the headline also compares group averages (goal-met
 * days vs the rest). If the two disagree, it falls back to general wording.
 * ------------------------------------------------------------------ */

import type { InsightDay } from './analyze'
import type { Insight } from './describe'

export type HeadlineIcon = 'water-sleep' | 'sleep-mood' | 'water-mood' | 'collecting'

/** One side of the A-vs-B proof under the headline. */
export interface ComparisonGroup {
  /** e.g. "Days ≥ 4 L water", "Nights of 7h+". */
  label: string
  /** Average outcome: minutes of sleep, or mood score 1–5. */
  value: number
  /** e.g. "7h 20m", "4.2 / 5". */
  display: string
  /** Number of days in this group. */
  days: number
}

/** The two group averages behind the headline sentence. */
export interface Comparison {
  /** What's being averaged: sleep minutes or mood score. */
  outcome: 'sleep' | 'mood'
  /** e.g. "Avg sleep", "Avg mood". */
  outcomeLabel: string
  /** [condition met, condition not met], e.g. [goal days, below-goal days]. */
  groups: [ComparisonGroup, ComparisonGroup]
  /** Index of the group with the better outcome (more sleep, higher mood). */
  better: 0 | 1
}

export interface Headline {
  /** finding: a real link; no-pattern: enough data, nothing strong; collecting: not enough data yet. */
  kind: 'finding' | 'no-pattern' | 'collecting'
  id: Insight['id'] | null
  /** The one bold sentence. */
  text: string
  /** One short supporting line, e.g. "Strong link · based on 21 days". */
  detail: string
  icon: HeadlineIcon
  rho: number | null
  n: number
  /** The A-vs-B averages backing the sentence; null when the headline is general wording. */
  comparison: Comparison | null
}

/** A headline needs at least a moderate link (|rho| ≥ 0.4). */
const HEADLINE_LEVELS = new Set<Insight['level']>(['very strong', 'strong', 'moderate'])
/** Each side of a comparison needs this many days. */
const MIN_GROUP = 3
/** Nights of this length or more count as "a full night". */
const FULL_NIGHT_MIN = 7 * 60
/** Differences smaller than these aren't worth a headline. */
const MIN_SLEEP_DIFF_MIN = 10
const MIN_MOOD_DIFF = 0.3

const ICONS: Record<Insight['id'], HeadlineIcon> = {
  'water-next-sleep': 'water-sleep',
  'sleep-mood': 'sleep-mood',
  'water-mood': 'water-mood',
}

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length
const isNum = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

/** "45 minutes", "1 hour 10 minutes"; rounded to 5 minutes. */
function minutes(m: number) {
  const r = Math.round(Math.abs(m) / 5) * 5
  const h = Math.floor(r / 60)
  const rest = r % 60
  const mins = `${rest} ${rest === 1 ? 'minute' : 'minutes'}`
  if (!h) return mins
  return `${h} ${h === 1 ? 'hour' : 'hours'}${rest ? ` ${mins}` : ''}`
}

/** Splits paired (x, y) values by `isHigh(x)`; null when either side has too few days. */
function groupSplit(pairs: [number, number][], isHigh: (x: number) => boolean) {
  const high = pairs.filter(([x]) => isHigh(x)).map(([, y]) => y)
  const low = pairs.filter(([x]) => !isHigh(x)).map(([, y]) => y)
  if (high.length < MIN_GROUP || low.length < MIN_GROUP) return null
  const highMean = mean(high)
  const lowMean = mean(low)
  return { highMean, lowMean, highDays: high.length, lowDays: low.length, diff: highMean - lowMean }
}

/** "4 L", "2.5 L", "3.05 L". */
const litres = (ml: number) => `${Number((ml / 1000).toFixed(2))} L`
/** "7h 20m". */
const hm = (min: number) => {
  const m = Math.round(min)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
const moodDisplay = (v: number) => `${v.toFixed(1)} / 5`

function comparison(
  outcome: Comparison['outcome'],
  labels: [string, string],
  split: NonNullable<ReturnType<typeof groupSplit>>,
): Comparison {
  const show = outcome === 'sleep' ? hm : moodDisplay
  return {
    outcome,
    outcomeLabel: outcome === 'sleep' ? 'Avg sleep' : 'Avg mood',
    groups: [
      { label: labels[0], value: split.highMean, display: show(split.highMean), days: split.highDays },
      { label: labels[1], value: split.lowMean, display: show(split.lowMean), days: split.lowDays },
    ],
    better: split.diff >= 0 ? 0 : 1,
  }
}

/** Concrete sentence and the A-vs-B averages behind it, or null when the data can't support one. */
function effect(insight: Insight, days: InsightDay[], goalMl: number): { text: string; comparison: Comparison } | null {
  const sign = Math.sign(insight.rho ?? 0)
  const pairs = (xs: (number | null)[], ys: (number | null)[]) =>
    xs.flatMap((x, i) => (isNum(x) && isNum(ys[i]) ? [[x, ys[i] as number] as [number, number]] : []))

  const water = days.map((d) => d.water_ml)
  const sleep = days.map((d) => d.sleep_minutes)
  const mood = days.map((d) => d.mood_score)
  const waterLabels: [string, string] = [`Days ≥ ${litres(goalMl)} water`, `Days < ${litres(goalMl)} water`]

  if (insight.id === 'water-next-sleep') {
    const split = groupSplit(pairs(water, [...sleep.slice(1), null]), (w) => w >= goalMl)
    if (!split || Math.sign(split.diff) !== sign || Math.abs(split.diff) < MIN_SLEEP_DIFF_MIN) return null
    return {
      text: `When you hit your water goal, you sleep ${minutes(split.diff)} ${split.diff > 0 ? 'longer' : 'less'} that night.`,
      comparison: comparison('sleep', waterLabels, split),
    }
  }
  if (insight.id === 'sleep-mood') {
    const split = groupSplit(pairs(sleep, mood), (s) => s >= FULL_NIGHT_MIN)
    if (!split || Math.sign(split.diff) !== sign || Math.abs(split.diff) < MIN_MOOD_DIFF) return null
    return {
      text: `After 7+ hours of sleep, your mood is ${Math.abs(split.diff).toFixed(1)} points ${split.diff > 0 ? 'higher' : 'lower'} the next day.`,
      comparison: comparison('mood', ['Nights of 7h+', 'Nights under 7h'], split),
    }
  }
  const split = groupSplit(pairs(water, mood), (w) => w >= goalMl)
  if (!split || Math.sign(split.diff) !== sign || Math.abs(split.diff) < MIN_MOOD_DIFF) return null
  return {
    text: `When you hit your water goal, your mood is ${Math.abs(split.diff).toFixed(1)} points ${split.diff > 0 ? 'higher' : 'lower'}.`,
    comparison: comparison('mood', waterLabels, split),
  }
}

/**
 * The single headline for the window: the strongest qualifying link, phrased
 * with a concrete difference when the data supports one.
 */
export function buildHeadline(insights: Insight[], days: InsightDay[], goalMl: number, windowDays: number): Headline {
  const found = insights
    .filter((i) => i.rho !== null && HEADLINE_LEVELS.has(i.level))
    .sort((a, b) => Math.abs(b.rho!) - Math.abs(a.rho!))[0]

  if (found) {
    const level = found.level.charAt(0).toUpperCase() + found.level.slice(1)
    const fx = effect(found, days, goalMl)
    return {
      kind: 'finding',
      id: found.id,
      text: fx?.text ?? found.message,
      detail: `${level} link · based on ${found.n} days`,
      icon: ICONS[found.id],
      rho: found.rho,
      n: found.n,
      comparison: fx?.comparison ?? null,
    }
  }

  const waiting = insights.filter((i) => i.level === 'insufficient' && i.daysNeeded > 0)
  if (waiting.length === insights.length) {
    const soonest = Math.min(...waiting.map((i) => i.daysNeeded))
    return {
      kind: 'collecting',
      id: null,
      text: `Log ${soonest} more ${soonest === 1 ? 'day' : 'days'} to unlock your first insight.`,
      detail: 'Track water, sleep and mood on the same days',
      icon: 'collecting',
      rho: null,
      n: Math.max(0, ...insights.map((i) => i.n)),
      comparison: null,
    }
  }

  return {
    kind: 'no-pattern',
    id: null,
    text: 'No strong patterns yet. Your water, sleep and mood look independent so far.',
    detail: `Last ${windowDays} days · keep logging`,
    icon: 'collecting',
    rho: null,
    n: Math.max(0, ...insights.map((i) => i.n)),
    comparison: null,
  }
}
