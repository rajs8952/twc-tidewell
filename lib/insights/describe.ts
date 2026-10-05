/* ------------------------------------------------------------------
 * Turns a Spearman result into a human-readable insight.
 * Wording describes co-occurrence ("match with", "tend to"), never cause:
 * a correlation can't show that one habit causes the other.
 * ------------------------------------------------------------------ */

import type { Correlation } from './analyze'
import { describeStrength } from './spearman'

/** Below this many paired days, no pattern is claimed at all. */
export const MIN_PAIRS_FOR_INSIGHT = 7

export type InsightLevel = 'very strong' | 'strong' | 'moderate' | 'weak' | 'none' | 'insufficient'
export type InsightDirection = 'positive' | 'negative' | 'none'

export interface Insight {
  id: Correlation['id']
  level: InsightLevel
  direction: InsightDirection
  /** Short lead, e.g. "Strong link found". */
  headline: string
  /** The finding in plain words, e.g. "High hydration days consistently match with longer sleep." */
  message: string
  /** headline + message, ready to display as one line. */
  text: string
  rho: number | null
  n: number
  /** Paired days still needed before a pattern is reported (0 once enough). */
  daysNeeded: number
}

/** The two things being compared, phrased for sentences. */
const PHRASES: Record<Correlation['id'], { subject: string; more: string; less: string; pair: string }> = {
  'water-next-sleep': {
    subject: 'High hydration days',
    more: 'longer sleep the following night',
    less: 'shorter sleep the following night',
    pair: 'water and the following night’s sleep',
  },
  'sleep-mood': {
    subject: 'Longer nights of sleep',
    more: 'a better mood the next day',
    less: 'a lower mood the next day',
    pair: 'sleep and the next day’s mood',
  },
  'water-mood': {
    subject: 'High hydration days',
    more: 'a better mood',
    less: 'a lower mood',
    pair: 'water and mood on the same day',
  },
}

const HEADLINES: Record<Exclude<InsightLevel, 'insufficient'>, string> = {
  'very strong': 'Very strong link found',
  strong: 'Strong link found',
  moderate: 'Moderate link',
  weak: 'Weak link',
  none: 'No clear link',
}

/** How firmly to state the pattern at each level. */
const ADVERB: Record<'very strong' | 'strong' | 'moderate' | 'weak', string> = {
  'very strong': 'almost always',
  strong: 'consistently',
  moderate: 'often',
  weak: 'sometimes',
}

const days = (n: number) => `${n} more ${n === 1 ? 'day' : 'days'}`

/**
 * Human-readable insight for one correlation, e.g. water vs sleep with
 * rho 0.72 over 21 days → "Strong link found: High hydration days
 * consistently match with longer sleep the following night."
 */
export function toInsight(c: Pick<Correlation, 'id' | 'rho' | 'n'>): Insight {
  const p = PHRASES[c.id]
  const base = { id: c.id, rho: c.rho, n: c.n }

  if (c.n < MIN_PAIRS_FOR_INSIGHT) {
    const needed = MIN_PAIRS_FOR_INSIGHT - c.n
    const headline = 'Not enough data yet'
    const message = `Log ${p.pair} on ${days(needed)} to see whether they’re linked.`
    return { ...base, level: 'insufficient', direction: 'none', headline, message, text: `${headline}: ${message}`, daysNeeded: needed }
  }
  if (c.rho === null) {
    // Enough days, but one side never changed (e.g. the same mood every day), so there's nothing to rank.
    const headline = 'Not enough variety yet'
    const message = `One of ${p.pair} has been the same every day, so there’s nothing to compare yet.`
    return { ...base, level: 'insufficient', direction: 'none', headline, message, text: `${headline}: ${message}`, daysNeeded: 0 }
  }

  const strength = describeStrength(c.rho)
  const level: InsightLevel = strength === 'very weak' ? 'none' : strength
  const headline = HEADLINES[level as Exclude<InsightLevel, 'insufficient'>]

  if (level === 'none') {
    const message = `Your ${p.pair} don’t move together in your data so far.`
    return { ...base, level, direction: 'none', headline, message, text: `${headline}: ${message}`, daysNeeded: 0 }
  }

  const direction: InsightDirection = c.rho > 0 ? 'positive' : 'negative'
  const adverb = ADVERB[level as keyof typeof ADVERB]
  const message =
    direction === 'positive'
      ? `${p.subject} ${adverb} match with ${p.more}.`
      : `${p.subject} ${adverb} match with ${p.less}.`
  return { ...base, level, direction, headline, message, text: `${headline}: ${message}`, daysNeeded: 0 }
}
