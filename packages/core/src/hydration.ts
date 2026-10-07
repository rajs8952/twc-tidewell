/* ------------------------------------------------------------------
 * OmniWell hydration model
 * Pure functions only — safe to unit test and to use anywhere.
 * ------------------------------------------------------------------ */

import { dayKey } from './dates'

export type Gender = 'male' | 'female' | 'unspecified'
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete'
export type BeverageId = 'water' | 'sparkling' | 'tea' | 'coffee' | 'juice' | 'milk'

/** Baseline: ~33 ml of fluid per kg of body weight per day. */
export const ML_PER_KG = 33
export const GOAL_MIN = 1200
export const GOAL_MAX = 5000

/** Average total-body-water differences between sexes, applied gently. */
export const GENDER_FACTOR: Record<Gender, number> = {
  male: 1.05,
  female: 0.95,
  unspecified: 1,
}

export const GENDERS: { id: Gender; label: string }[] = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'unspecified', label: 'Prefer not to say' },
]

export const ACTIVITY_LEVELS: { id: Activity; label: string; hint: string; extraMl: number }[] = [
  { id: 'sedentary', label: 'Mostly sitting', hint: 'Desk work, little exercise', extraMl: 0 },
  { id: 'light', label: 'Lightly active', hint: 'Daily walks or 1–2 workouts a week', extraMl: 350 },
  { id: 'moderate', label: 'Moderately active', hint: '3–4 workouts a week', extraMl: 600 },
  { id: 'active', label: 'Very active', hint: 'Daily training or a physical job', extraMl: 900 },
  { id: 'athlete', label: 'Athlete', hint: 'Hard training, often twice a day', extraMl: 1200 },
]

export interface GoalInput {
  weightKg: number
  gender: Gender
  activity: Activity
}

export interface GoalBreakdown {
  base: number
  genderAdj: number
  activityAdj: number
  total: number
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)
const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** The smart goal: weight-based baseline, adjusted for sex and activity. */
export function goalBreakdown({ weightKg, gender, activity }: GoalInput): GoalBreakdown {
  const w = clamp(Number.isFinite(weightKg) ? weightKg : 70, 25, 300)
  const base = w * ML_PER_KG
  const genderAdj = base * (GENDER_FACTOR[gender] - 1)
  const activityAdj = ACTIVITY_LEVELS.find((a) => a.id === activity)?.extraMl ?? 0
  const total = clamp(roundTo(base + genderAdj + activityAdj, 50), GOAL_MIN, GOAL_MAX)
  return { base: Math.round(base), genderAdj: Math.round(genderAdj), activityAdj, total }
}

export const calculateDailyGoal = (input: GoalInput) => goalBreakdown(input).total

export function effectiveGoal(p: {
  weight_kg: number
  gender: Gender
  activity_level: Activity
  custom_goal_ml: number | null
}) {
  return p.custom_goal_ml ?? calculateDailyGoal({ weightKg: p.weight_kg, gender: p.gender, activity: p.activity_level })
}

/* ---------- Beverages ---------- */

export interface Beverage {
  id: BeverageId
  label: string
  /** Share of the volume that counts toward hydration. */
  multiplier: number
  color: string
}

export const BEVERAGES: Record<BeverageId, Beverage> = {
  water: { id: 'water', label: 'Water', multiplier: 1.0, color: '#2189D6' },
  sparkling: { id: 'sparkling', label: 'Sparkling', multiplier: 1.0, color: '#4FBFCB' },
  tea: { id: 'tea', label: 'Tea', multiplier: 0.9, color: '#6E9B4A' },
  coffee: { id: 'coffee', label: 'Coffee', multiplier: 0.8, color: '#7A5236' },
  juice: { id: 'juice', label: 'Juice', multiplier: 0.85, color: '#E9851F' },
  milk: { id: 'milk', label: 'Milk', multiplier: 1.0, color: '#B9A47E' },
}

export const BEVERAGE_ORDER: BeverageId[] = ['water', 'sparkling', 'tea', 'coffee', 'juice', 'milk']

export const PRESETS: { ml: number; label: string }[] = [
  { ml: 150, label: 'Cup' },
  { ml: 250, label: 'Glass' },
  { ml: 330, label: 'Can' },
  { ml: 500, label: 'Bottle' },
  { ml: 750, label: 'Sport bottle' },
]

/* ---------- Motivational copy ---------- */

const MESSAGES = {
  start: [
    'A glass now sets the tone for the whole day.',
    'Fresh day, empty glass. Your first sip starts the streak.',
    'Start with one glass before your first screen.',
  ],
  low: [
    'Good start. Keep a bottle within reach.',
    'Another glass before your next task?',
    'Small sips add up faster than you think.',
  ],
  mid: [
    'Halfway there. Your focus will thank you.',
    'Steady pace. Keep it flowing.',
    'Momentum is on your side now.',
  ],
  high: [
    'Almost full. One or two more glasses.',
    'The finish line is a glass away.',
    'So close. Top it off.',
  ],
  done: [
    'Goal reached. Nicely done.',
    'Fully topped up for today.',
    'Hydration handled. See you tomorrow.',
  ],
  late: [
    'Evening catch-up: a glass now beats a big gulp before bed.',
    'There’s still time. Spread a few glasses across the evening.',
  ],
}

function hash(s: string) {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic per day + bucket so the message doesn't flicker on re-render. */
export function motivationalMessage(progress: number, now = new Date()): string {
  const bucket: keyof typeof MESSAGES =
    progress >= 1
      ? 'done'
      : now.getHours() >= 18 && progress < 0.5
        ? 'late'
        : progress === 0
          ? 'start'
          : progress < 0.35
            ? 'low'
            : progress < 0.75
              ? 'mid'
              : 'high'
  const list = MESSAGES[bucket]
  return list[hash(dayKey(now) + bucket) % list.length]
}

export const formatMl = (ml: number) => `${Math.round(ml).toLocaleString()} ml`
export const formatLitres = (ml: number) => `${(ml / 1000).toFixed(ml >= 10000 ? 0 : 1)} L`
