/* ------------------------------------------------------------------
 * Meditation tracker: shared constants, types and validation.
 * Used by both the server actions and the client UI.
 * ------------------------------------------------------------------ */

import { addDays, startOfDay, startOfWeek } from './hydration'
import type { DateRange, RangeQuery } from './types'

export type { ActionResult, DateRange } from './types'

export type SessionType = 'mindfulness' | 'breathing' | 'body_scan' | 'loving_kindness' | 'guided' | 'other'

export const SESSION_TYPES: { id: SessionType; label: string; hint: string }[] = [
  { id: 'mindfulness', label: 'Mindfulness', hint: 'Rest your attention on the present moment.' },
  { id: 'breathing', label: 'Breathing', hint: 'Follow the circle: breathe in as it grows, out as it shrinks.' },
  { id: 'body_scan', label: 'Body scan', hint: 'Move your attention slowly from head to toe.' },
  { id: 'loving_kindness', label: 'Loving-kindness', hint: 'Wish yourself and others well.' },
  { id: 'guided', label: 'Guided', hint: 'Following an app, video or teacher.' },
  { id: 'other', label: 'Other', hint: 'Any other practice.' },
]

export const SESSION_BY_ID = Object.fromEntries(SESSION_TYPES.map((s) => [s.id, s])) as Record<
  SessionType,
  (typeof SESSION_TYPES)[number]
>

/** Timer and quick-log length presets, in minutes. */
export const DURATIONS = [3, 5, 10, 15, 20, 30]

export const MAX_MINUTES = 600

export const CALM_LABELS = ['Very tense', 'Tense', 'Neutral', 'Calm', 'Very calm'] as const

/** Seconds per half breath for the breathing guide (4 in, 4 out). */
export const BREATH_SECONDS = 4

export interface MeditationLog {
  id: string
  duration_min: number
  session_type: SessionType
  calm_before: number | null
  calm_after: number | null
  note: string | null
  logged_at: string
}

export interface MeditationInput {
  duration_min: number
  session_type: SessionType
  calm_before?: number | null
  calm_after?: number | null
  note?: string | null
}

const isLevel = (n: unknown) => n == null || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5)

/** Mirrors the CHECK constraints on meditation_logs in supabase/wellness.sql. */
export function validateMeditationInput(
  input: unknown,
): { ok: true; value: MeditationInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing session details.' }
  const i = input as Record<string, unknown>
  const minutes = i.duration_min
  if (!Number.isInteger(minutes) || (minutes as number) < 1 || (minutes as number) > MAX_MINUTES) {
    return { ok: false, error: `Sessions must be between 1 and ${MAX_MINUTES} minutes.` }
  }
  if (!SESSION_TYPES.some((s) => s.id === i.session_type)) return { ok: false, error: 'Pick a type of session.' }
  if (!isLevel(i.calm_before) || !isLevel(i.calm_after)) return { ok: false, error: 'Calm ratings must be between 1 and 5.' }

  const note = typeof i.note === 'string' ? i.note.trim() : null
  if (note && note.length > 1000) return { ok: false, error: 'Notes can be up to 1,000 characters.' }

  return {
    ok: true,
    value: {
      duration_min: minutes as number,
      session_type: i.session_type as SessionType,
      calm_before: (i.calm_before as number | null | undefined) ?? null,
      calm_after: (i.calm_after as number | null | undefined) ?? null,
      note: note || null,
    },
  }
}

/** "1 h 5 min", "12 min". */
export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "04:59" style countdown. */
export function formatClock(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** How meditation entries are listed; shared by the Meditation server action and the dashboard loader. */
export const MEDITATION_QUERY: RangeQuery<MeditationLog> = {
  name: 'Meditation',
  table: 'meditation_logs',
  columns: 'id, duration_min, session_type, calm_before, calm_after, note, logged_at',
  timeColumn: 'logged_at',
}

/** What the Meditation card shows: this week (Monday) through today. */
export const meditationRange = (now = new Date()): DateRange => ({
  from: startOfWeek(now).toISOString(),
  to: addDays(startOfDay(now), 1).toISOString(),
})
