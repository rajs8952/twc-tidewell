/* ------------------------------------------------------------------
 * Pattern nudges: rules over the last week rather than one entry.
 *
 *   mood-pattern     low mood (Bad/Awful) on 3+ of the last 7 days  → WARNING    therapist
 *   stress-pattern   high stress (4–5) on 3+ of the last 7 days     → SUGGESTION therapist
 *   welcome-back     logging again today after 3+ quiet days        → CHEER
 *   lapse            nothing logged for 3+ days (settled accounts)  → SUGGESTION quick check-in
 *   exercise-nudge   no exercise yet this week, from Thursday       → SUGGESTION log a walk
 *   water-nudge      under half the water goal after 6 pm           → SUGGESTION (water users only)
 *   streak-milestone a 7/14/21/30… day water-goal streak            → CHEER
 *
 * Keys decide how often each can come back once dismissed (per day or per
 * week). Pure, like the rest of the engine.
 * ------------------------------------------------------------------ */

import type { MoodLog } from '@rajs8952/core/mood'
import { MOOD_BY_ID } from '@rajs8952/core/mood'
import type { Intervention } from './index'

export interface PatternInput {
  now?: Date
  /** Mood check-ins from (at least) the last 7 days. */
  moods: MoodLog[]
  /** Local day keys ('YYYY-MM-DD') with anything logged, from any tracker. */
  activeDays: Set<string>
  /** Days in the last 7 with water logged (water nudges are for people who track it). */
  waterDaysLast7: number
  water?: { todayMl: number; goalMl: number } | null
  /** Exercise minutes so far this week (Monday–Sunday); null if unknown. */
  exerciseWeekMin: number | null
  /** Current water-goal streak, in days. */
  waterGoalStreak: number
  /** Days since the account was created. */
  accountAgeDays: number
}

type Keyed = Intervention & { key: string }

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
/** Monday of the week, as a key (weekly keys reset each Monday). */
function weekKey(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return dayKey(x)
}

const MILESTONES = [7, 14, 21, 30, 50, 75, 100, 150, 200, 365]

export function patternInterventions(input: PatternInput): Keyed[] {
  const now = input.now ?? new Date()
  const today = dayKey(now)
  const week = weekKey(now)
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => dayKey(addDays(now, -i))))
  const out: Keyed[] = []

  // Mood and stress over the last 7 days, one verdict per day (that day's average).
  const byDay = new Map<string, { scores: number[]; stress: number[] }>()
  for (const m of input.moods) {
    const k = dayKey(new Date(m.logged_at))
    if (!last7.has(k)) continue
    const d = byDay.get(k) ?? { scores: [], stress: [] }
    d.scores.push(MOOD_BY_ID[m.mood_state]?.score ?? 3)
    if (typeof m.stress_level === 'number') d.stress.push(m.stress_level)
    byDay.set(k, d)
  }
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const lowDays = [...byDay.values()].filter((d) => avg(d.scores) <= 2).length
  const stressDays = [...byDay.values()].filter((d) => d.stress.length && avg(d.stress) >= 4).length

  if (lowDays >= 3) {
    out.push({
      key: `mood-pattern:${week}`,
      severity: 'WARNING',
      metric: 'mood',
      rule: 'mood-pattern',
      title: 'A tough few days',
      message: `You’ve logged a low mood on ${lowDays} of the last 7 days. Talking it through with a therapist can really help, and it’s private.`,
      actions: [{ kind: 'chat', label: 'Talk to a therapist', contact: 'therapist' }],
      showEmergencyNote: false,
    })
  } else if (stressDays >= 3) {
    out.push({
      key: `stress-pattern:${week}`,
      severity: 'SUGGESTION',
      metric: 'mood',
      rule: 'stress-pattern',
      title: 'Stress has been running high',
      message: `High stress on ${stressDays} of the last 7 days. A therapist can help you find what eases it. A short breathing session helps in the moment, too.`,
      actions: [{ kind: 'chat', label: 'Talk to a therapist', contact: 'therapist' }],
      showEmergencyNote: false,
    })
  }

  // Coming back, or drifting away.
  const loggedToday = input.activeDays.has(today)
  const previous = [...input.activeDays].filter((k) => k < today).sort().pop()
  const gapDays = previous ? Math.round((new Date(today).getTime() - new Date(previous).getTime()) / 86_400_000) - 1 : null
  if (loggedToday && gapDays !== null && gapDays >= 3) {
    out.push({
      key: `welcome-back:${today}`,
      severity: 'CHEER',
      metric: 'mood',
      rule: 'welcome-back',
      title: 'Welcome back',
      message: 'Good to see you again. Picking a habit back up is what makes it last, so this counts.',
      actions: [],
      showEmergencyNote: false,
    })
  } else if (!loggedToday && input.accountAgeDays >= 3 && (previous === undefined || (gapDays ?? 0) >= 2)) {
    // previous is yesterday-or-earlier; today isn't logged, so the quiet run includes today.
    out.push({
      key: `lapse:${today}`,
      severity: 'SUGGESTION',
      metric: 'mood',
      rule: 'lapse',
      title: 'We’ve missed you',
      message: 'It’s been a few days. A ten-second mood check-in is an easy way back in.',
      actions: [{ kind: 'open', label: 'Quick check-in', href: '/mood' }],
      showEmergencyNote: false,
    })
  }

  // No exercise yet this week, from Thursday.
  const weekday = now.getDay() // 0 Sunday … 6 Saturday
  if (input.exerciseWeekMin === 0 && (weekday === 0 || weekday >= 4)) {
    out.push({
      key: `exercise-nudge:${week}`,
      severity: 'SUGGESTION',
      metric: 'exercise',
      rule: 'exercise-nudge',
      title: 'No exercise yet this week',
      message: 'A brisk ten-minute walk counts, and it lifts your mood and sleep too.',
      actions: [{ kind: 'open', label: 'Log a walk', href: '/exercise' }],
      showEmergencyNote: false,
    })
  }

  // Water: under half the goal by the evening, for people who track water.
  if (input.water && input.water.goalMl > 0 && input.waterDaysLast7 >= 2 && now.getHours() >= 18 && input.water.todayMl < input.water.goalMl / 2) {
    out.push({
      key: `water-nudge:${today}`,
      severity: 'SUGGESTION',
      metric: 'water',
      rule: 'water-nudge',
      title: 'Time for a glass?',
      message: `You’re at ${input.water.todayMl.toLocaleString()} ml of ${input.water.goalMl.toLocaleString()} ml. A couple of glasses this evening would help.`,
      actions: [{ kind: 'open', label: 'Log water', href: '/water' }],
      showEmergencyNote: false,
    })
  }

  // Milestones.
  if (MILESTONES.includes(input.waterGoalStreak)) {
    out.push({
      key: `streak-milestone:water:${input.waterGoalStreak}:${today}`,
      severity: 'CHEER',
      metric: 'water',
      rule: 'streak-milestone',
      title: `${input.waterGoalStreak} days in a row!`,
      message: `You’ve hit your water goal ${input.waterGoalStreak} days running. That’s a real habit now.`,
      actions: [],
      showEmergencyNote: false,
    })
  }

  return out
}
