/* ------------------------------------------------------------------
 * Mood tracker: shared constants, types and validation.
 * Imported by both the server actions and the client UI, so it must
 * stay free of server-only or browser-only code.
 * ------------------------------------------------------------------ */

export type MoodState = 'awful' | 'bad' | 'okay' | 'good' | 'great'

export const MOODS: { id: MoodState; label: string; score: number; color: string; tint: string }[] = [
  { id: 'awful', label: 'Awful', score: 1, color: '#B8402B', tint: '#F6E1DC' },
  { id: 'bad', label: 'Bad', score: 2, color: '#E9851F', tint: '#FCEBD7' },
  { id: 'okay', label: 'Okay', score: 3, color: '#B97C0E', tint: '#FDF1D6' },
  { id: 'good', label: 'Good', score: 4, color: '#4F9B5B', tint: '#E2F1E3' },
  { id: 'great', label: 'Great', score: 5, color: '#2189D6', tint: '#DDF1FB' },
]

export const MOOD_BY_ID = Object.fromEntries(MOODS.map((m) => [m.id, m])) as Record<MoodState, (typeof MOODS)[number]>

export const EMOTIONS = [
  'calm',
  'happy',
  'grateful',
  'focused',
  'tired',
  'anxious',
  'stressed',
  'sad',
  'irritable',
  'lonely',
] as const

export const LEVEL_LABELS = ['Very low', 'Low', 'Medium', 'High', 'Very high'] as const

export interface MoodLog {
  id: string
  mood_state: MoodState
  energy_level: number | null
  stress_level: number | null
  emotions: string[]
  note: string | null
  logged_at: string
}

export interface MoodInput {
  mood_state: MoodState
  energy_level?: number | null
  stress_level?: number | null
  emotions?: string[]
  note?: string | null
}

import { addDays, startOfDay, startOfWeek } from './hydration'
import type { DateRange, RangeQuery } from './types'

export type { ActionResult, DateRange } from './types'

const isLevel = (n: unknown) => n == null || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5)

/**
 * Mirrors the CHECK constraints in supabase/wellness.sql, so bad input
 * gets a friendly message instead of a raw database error.
 */
export function validateMoodInput(input: unknown): { ok: true; value: MoodInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing mood check-in.' }
  const i = input as Record<string, unknown>
  if (!MOODS.some((m) => m.id === i.mood_state)) return { ok: false, error: 'Pick how you feel first.' }
  if (!isLevel(i.energy_level)) return { ok: false, error: 'Energy must be between 1 and 5.' }
  if (!isLevel(i.stress_level)) return { ok: false, error: 'Stress must be between 1 and 5.' }

  const emotions = i.emotions ?? []
  if (!Array.isArray(emotions) || emotions.some((e) => !(EMOTIONS as readonly string[]).includes(e as string))) {
    return { ok: false, error: 'Unknown emotion tag.' }
  }
  if (emotions.length > 12) return { ok: false, error: 'Choose up to 12 emotions.' }

  const note = typeof i.note === 'string' ? i.note.trim() : null
  if (note && note.length > 1000) return { ok: false, error: 'Notes can be up to 1,000 characters.' }

  return {
    ok: true,
    value: {
      mood_state: i.mood_state as MoodState,
      energy_level: (i.energy_level as number | null | undefined) ?? null,
      stress_level: (i.stress_level as number | null | undefined) ?? null,
      emotions: [...new Set(emotions as string[])],
      note: note || null,
    },
  }
}

/** How mood entries are listed; shared by the Mood server action and the dashboard loader. */
export const MOOD_QUERY: RangeQuery<MoodLog> = {
  name: 'Mood',
  table: 'mood_logs',
  columns: 'id, mood_state, energy_level, stress_level, emotions, note, logged_at',
  timeColumn: 'logged_at',
}

/** What the Mood card shows: this week (Monday) through today. */
export const moodRange = (now = new Date()): DateRange => ({
  from: startOfWeek(now).toISOString(),
  to: addDays(startOfDay(now), 1).toISOString(),
})
