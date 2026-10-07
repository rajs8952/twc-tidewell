/* ------------------------------------------------------------------
 * Sleep tracker: shared constants, types, validation and helpers.
 * Used by both the server actions and the client UI.
 * ------------------------------------------------------------------ */

import { addDays, startOfDay, startOfWeek } from './dates'
import type { DateRange } from './types'

export type { ActionResult, DateRange } from './types'

export const QUALITY_LABELS = ['Terrible', 'Poor', 'Okay', 'Good', 'Excellent'] as const

/** Hours-slept slider range and step (15 minutes). */
export const MIN_HOURS = 1
export const MAX_HOURS = 14
export const HOURS_STEP = 0.25

/** Commonly recommended adult range, drawn as a band on the week chart. */
export const TARGET_MIN_HOURS = 7
export const TARGET_MAX_HOURS = 9

export const MAX_AWAKENINGS = 50

/** A wake time may be slightly ahead of the server clock (device clock drift). */
const FUTURE_TOLERANCE_MS = 10 * 60_000

export interface SleepLog {
  id: string
  bed_at: string
  wake_at: string
  duration_min: number
  quality: number
  awakenings: number | null
  note: string | null
  logged_at: string
}

export interface SleepInput {
  bed_at: string
  wake_at: string
  quality: number
  awakenings?: number | null
  note?: string | null
}

/** Mirrors the CHECK constraints on sleep_logs in supabase/wellness.sql, plus "not in the future". */
export function validateSleepInput(input: unknown, now = Date.now()): { ok: true; value: SleepInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing sleep details.' }
  const i = input as Record<string, unknown>

  const bed = typeof i.bed_at === 'string' ? Date.parse(i.bed_at) : NaN
  const wake = typeof i.wake_at === 'string' ? Date.parse(i.wake_at) : NaN
  if (Number.isNaN(bed) || Number.isNaN(wake)) return { ok: false, error: 'Bedtime and wake time are required.' }
  if (wake <= bed) return { ok: false, error: 'Wake time must be after bedtime.' }
  if (wake - bed > 24 * 3_600_000) return { ok: false, error: 'A sleep can be at most 24 hours.' }
  if (wake - bed < 15 * 60_000) return { ok: false, error: 'Sleeps under 15 minutes aren’t logged.' }
  if (wake > now + FUTURE_TOLERANCE_MS) return { ok: false, error: 'That wake time is in the future.' }

  if (!Number.isInteger(i.quality) || (i.quality as number) < 1 || (i.quality as number) > 5) {
    return { ok: false, error: 'Rate how well you slept.' }
  }
  const awakenings = i.awakenings ?? null
  if (awakenings !== null && (!Number.isInteger(awakenings) || (awakenings as number) < 0 || (awakenings as number) > MAX_AWAKENINGS)) {
    return { ok: false, error: `Wake-ups must be between 0 and ${MAX_AWAKENINGS}.` }
  }

  const note = typeof i.note === 'string' ? i.note.trim() : null
  if (note && note.length > 1000) return { ok: false, error: 'Notes can be up to 1,000 characters.' }

  return {
    ok: true,
    value: {
      bed_at: new Date(bed).toISOString(),
      wake_at: new Date(wake).toISOString(),
      quality: i.quality as number,
      awakenings: awakenings as number | null,
      note: note || null,
    },
  }
}

/** "7 h 30 min", "8 h". */
export function formatDuration(min: number) {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export const formatTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Local wake time on the given day: wakeDay = 0 for today, -1 for yesterday; hhmm = "07:00". */
export function wakeDate(hhmm: string, wakeDay: 0 | -1, today = new Date()) {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + wakeDay, h || 0, m || 0)
  return d
}

/** Bedtime from a wake time and hours slept. */
export const bedDate = (wake: Date, hours: number) => new Date(wake.getTime() - Math.round(hours * 60) * 60_000)

/** What the Sleep card shows: last week and this week, by wake time, so a Monday isn't empty. */
export const sleepRange = (now = new Date()): DateRange => ({
  from: addDays(startOfWeek(now), -7).toISOString(),
  to: addDays(startOfDay(now), 1).toISOString(),
})
