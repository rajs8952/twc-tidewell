import { bmi, bmiBand } from '@omniwell/core/biometrics'
import { MOOD_BY_ID, type MoodLog, type MoodState } from '@omniwell/core/mood'
import type { SleepLog } from '@omniwell/core/sleep'
import type { WeightLog } from '@omniwell/core/weight'
import type { WellnessContact } from './wellness-team'

/* ------------------------------------------------------------------
 * Intervention engine: turns one logged metric into a nudge, from
 * "nice work" up to "please reach out now", pointing at the company's
 * wellness team (lib/wellness-team.ts) where it helps.
 *
 * Pure and synchronous: no React, Supabase or browser APIs, so it can
 * run in a server action, a client component or a test alike.
 *
 * Rules (thresholds live in RULES):
 *   mood   score 1 (Awful)         → CRITICAL   EAP helpline + chat with a therapist
 *   sleep  < 5 h or > 8 h          → WARNING    consultation with the wellness team
 *   weight BMI 25+ (needs height)  → SUGGESTION talk to the dietitian
 *   anything else                  → NORMAL     positive reinforcement
 * ------------------------------------------------------------------ */

export type Severity = 'CRITICAL' | 'WARNING' | 'SUGGESTION' | 'NORMAL'

/** Highest first; used to pick the one nudge to show when several apply. */
export const SEVERITY_ORDER: Severity[] = ['CRITICAL', 'WARNING', 'SUGGESTION', 'NORMAL']

export const RULES = {
  /** Mood scores at or below this are critical (1 = Awful on the 1–5 scale). */
  moodCriticalAtOrBelow: 1,
  /** Sleep outside [min, max] hours is a warning; the bounds themselves are fine. */
  sleepMinHours: 5,
  sleepMaxHours: 8,
  /** WHO "overweight" starts at a BMI of 25; obesity (30+) gets the same suggestion. */
  bmiSuggestAtOrAbove: 25,
} as const

/** Tracker values as they're logged. */
export type LoggedMetric =
  /** 1–5 score, or the mood id ('awful' … 'great'). */
  | { type: 'mood'; value: number | MoodState }
  /** Hours slept. */
  | { type: 'sleep'; value: number }
  /** Body weight in kg. */
  | { type: 'weight'; value: number }
  /** No rules yet: always NORMAL. Water in ml, exercise and meditation in minutes. */
  | { type: 'water' | 'exercise' | 'meditation'; value: number }

export type MetricType = LoggedMetric['type']

/** Profile data some rules need. */
export interface InterventionContext {
  heightCm?: number | null
}

export interface InterventionAction {
  /** call: dial the contact; chat: message them; book: open their booking link. */
  kind: 'call' | 'chat' | 'book'
  label: string
  contact: WellnessContact['id']
}

export interface Intervention {
  severity: Severity
  metric: MetricType
  /** Stable id for the rule that fired, e.g. for analytics or tests. */
  rule: 'mood-critical' | 'sleep-short' | 'sleep-long' | 'bmi-high' | 'normal'
  title: string
  message: string
  /** Most important first. Empty for NORMAL. */
  actions: InterventionAction[]
  /** Show "call your local emergency number" alongside the actions. */
  showEmergencyNote: boolean
  /** Something the rule needed but didn't have, e.g. height for BMI. */
  missing?: 'height'
}

const formatHours = (h: number) => {
  const mins = Math.round(h * 60)
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  return mm ? `${hh} h ${mm} min` : `${hh} h`
}

const NORMAL_MESSAGES: Record<MetricType, { title: string; message: string }> = {
  mood: { title: 'Thanks for checking in', message: 'Noticing how you feel is a habit worth keeping. See you tomorrow.' },
  sleep: { title: 'Good rest', message: 'That’s a healthy amount of sleep. Keep your bedtime steady to make it stick.' },
  weight: { title: 'Logged', message: 'Regular weigh-ins show the trend, not the daily ups and downs. Nice consistency.' },
  water: { title: 'Nice sip', message: 'Every glass counts towards today’s goal.' },
  exercise: { title: 'Great work', message: 'Moving your body is one of the best things you can do for your mood and sleep.' },
  meditation: { title: 'Well done', message: 'A few calm minutes add up. Your mind will thank you.' },
}

function normal(metric: MetricType, extra?: Partial<Intervention>): Intervention {
  return { severity: 'NORMAL', metric, rule: 'normal', ...NORMAL_MESSAGES[metric], actions: [], showEmergencyNote: false, ...extra }
}

function moodScore(value: number | MoodState): number {
  const score = typeof value === 'number' ? value : MOOD_BY_ID[value]?.score
  if (!(typeof score === 'number' && Number.isInteger(score) && score >= 1 && score <= 5)) {
    throw new RangeError(`Mood must be a score from 1 to 5 or a mood id; got ${String(value)}.`)
  }
  return score
}

function requireFinite(value: number, what: string) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${what} must be a positive number; got ${String(value)}.`)
  }
}

/** Evaluates one logged metric against the rules above. Throws RangeError on an impossible value. */
export function evaluateMetric(metric: LoggedMetric, context: InterventionContext = {}): Intervention {
  switch (metric.type) {
    case 'mood': {
      if (moodScore(metric.value) <= RULES.moodCriticalAtOrBelow) {
        return {
          severity: 'CRITICAL',
          metric: 'mood',
          rule: 'mood-critical',
          title: 'You don’t have to get through this alone',
          message:
            'It sounds like today is really hard. Talking to someone can help, and the company’s support team is there for exactly this.',
          actions: [
            { kind: 'call', label: 'Call the EAP helpline', contact: 'eap' },
            { kind: 'chat', label: 'Chat with a therapist', contact: 'therapist' },
          ],
          showEmergencyNote: true,
        }
      }
      return normal('mood')
    }

    case 'sleep': {
      requireFinite(metric.value, 'Sleep hours')
      const short = metric.value < RULES.sleepMinHours
      if (short || metric.value > RULES.sleepMaxHours) {
        return {
          severity: 'WARNING',
          metric: 'sleep',
          rule: short ? 'sleep-short' : 'sleep-long',
          title: short ? 'That’s not much sleep' : 'That’s a lot of sleep',
          message: short
            ? `You slept ${formatHours(metric.value)}. A night like this now and then is normal, but if it keeps happening the wellness team can help you find out why.`
            : `You slept ${formatHours(metric.value)}. Regularly needing this much can be a sign of low energy, diet or stress, which the wellness team can help with.`,
          actions: [{ kind: 'book', label: 'Book a wellness consultation', contact: 'dietitian' }],
          showEmergencyNote: false,
        }
      }
      return normal('sleep')
    }

    case 'weight': {
      requireFinite(metric.value, 'Weight')
      const value = bmi(context.heightCm ?? null, metric.value)
      if (value == null) return normal('weight', { missing: 'height' })
      if (value >= RULES.bmiSuggestAtOrAbove) {
        return {
          severity: 'SUGGESTION',
          metric: 'weight',
          rule: 'bmi-high',
          title: 'A dietitian could help',
          message: `Your BMI is ${value.toFixed(1)}, ${bmiBand(value).label.toLowerCase()}. BMI is only a rough guide, so a chat with the dietitian is the best way to get advice that fits you.`,
          actions: [{ kind: 'book', label: 'Talk to the dietitian', contact: 'dietitian' }],
          showEmergencyNote: false,
        }
      }
      return normal('weight')
    }

    default:
      return normal(metric.type)
  }
}

/** The most severe of several interventions (the first one wins a tie), or null for none. */
export function mostSevere(interventions: Intervention[]): Intervention | null {
  let best: Intervention | null = null
  for (const i of interventions) {
    if (!best || SEVERITY_ORDER.indexOf(i.severity) < SEVERITY_ORDER.indexOf(best.severity)) best = i
  }
  return best
}

/** An intervention plus a key that identifies this occurrence, for dismissing it. */
export type KeyedIntervention = Intervention & { key: string }

/** 'YYYY-MM-DD' in the browser's timezone. */
export const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Mood alerts are keyed by day: acknowledging one covers the rest of today, on the Hub and the Mood page. */
export const moodInterventionKey = (i: Intervention, now = new Date()) => `${i.rule}:${localDay(now)}`

/**
 * The non-NORMAL interventions for the Hub, most severe first, from each
 * tracker's latest data (lists are newest first, as the range queries return them):
 *  - mood:   today's latest check-in. Keyed by day, so one acknowledgement covers today.
 *  - sleep:  a night that ended in the last 24 hours. Keyed by the entry.
 *  - weight: the latest weigh-in, else the profile weight, with the profile height.
 *            Keyed by month, so a dismissed suggestion comes back once a month at most.
 */
export function latestInterventions(
  logs: { mood?: MoodLog[]; sleep?: SleepLog[]; weight?: WeightLog[] },
  profile: { height_cm: number | null; weight_kg: number } | null,
  now = new Date(),
): KeyedIntervention[] {
  const out: KeyedIntervention[] = []
  const today = localDay(now)

  const mood = logs.mood?.find((l) => localDay(new Date(l.logged_at)) === today)
  if (mood) {
    const r = evaluateMetric({ type: 'mood', value: mood.mood_state })
    if (r.severity !== 'NORMAL') out.push({ ...r, key: moodInterventionKey(r, now) })
  }

  const sleep = logs.sleep?.find((l) => now.getTime() - new Date(l.wake_at).getTime() < 24 * 3_600_000)
  if (sleep && sleep.duration_min > 0) {
    const r = evaluateMetric({ type: 'sleep', value: sleep.duration_min / 60 })
    if (r.severity !== 'NORMAL') out.push({ ...r, key: `${r.rule}:${sleep.id}` })
  }

  const weightKg = logs.weight?.[0]?.weight_kg ?? profile?.weight_kg
  if (weightKg && profile?.height_cm) {
    const r = evaluateMetric({ type: 'weight', value: weightKg }, { heightCm: profile.height_cm })
    if (r.severity !== 'NORMAL') out.push({ ...r, key: `${r.rule}:${today.slice(0, 7)}` })
  }

  return out.sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
}
