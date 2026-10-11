/* ------------------------------------------------------------------
 * "When did this happen?" for log entries: now, earlier today or
 * yesterday at a time, or (when editing) the entry's original time.
 * Shared by the tracker forms (the WhenPicker in @rajs8952/ui) and the
 * validators, so the browser and the server apply the same rules.
 * ------------------------------------------------------------------ */

import { addDays, startOfDay } from './dates'

/** How far back an entry can be dated or moved. */
export const MAX_BACKDATE_DAYS = 7
/** Clocks drift: allow a few minutes "in the future". */
const FUTURE_TOLERANCE_MS = 5 * 60_000

export type WhenChoice =
  | { day: 'now' }
  | { day: 'today' | 'yesterday'; time: string }
  /** Editing: keep the entry's own time. */
  | { day: 'original'; iso: string }

/**
 * Checks an optional client-supplied logged_at. Absent means "now" (the
 * database default); present, it must be a real time, not in the future and
 * at most MAX_BACKDATE_DAYS ago.
 */
export function validateLoggedAt(v: unknown, now = new Date()): { ok: true; value?: string } | { ok: false; error: string } {
  if (v === undefined || v === null || v === '') return { ok: true }
  if (typeof v !== 'string') return { ok: false, error: 'Invalid time.' }
  const t = Date.parse(v)
  if (Number.isNaN(t)) return { ok: false, error: 'Invalid time.' }
  if (t > now.getTime() + FUTURE_TOLERANCE_MS) return { ok: false, error: 'That time is in the future.' }
  if (t < now.getTime() - MAX_BACKDATE_DAYS * 86_400_000) return { ok: false, error: `Entries can be dated up to ${MAX_BACKDATE_DAYS} days back.` }
  return { ok: true, value: new Date(t).toISOString() }
}

/** The ISO time a choice stands for; undefined for "now" (let the database stamp it). */
export function whenToIso(c: WhenChoice, now = new Date()): string | undefined {
  if (c.day === 'now') return undefined
  if (c.day === 'original') return c.iso
  const [h, m] = c.time.split(':').map(Number)
  const base = c.day === 'today' ? startOfDay(now) : addDays(startOfDay(now), -1)
  const d = new Date(base)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d.toISOString()
}

/** "HH:MM" of a date, local time. */
export const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** The choice that shows an existing entry's time: today/yesterday at its time, else its original date. */
export function whenFromIso(iso: string, now = new Date()): WhenChoice {
  const d = new Date(iso)
  const day = startOfDay(d).getTime()
  if (day === startOfDay(now).getTime()) return { day: 'today', time: hhmm(d) }
  if (day === addDays(startOfDay(now), -1).getTime()) return { day: 'yesterday', time: hhmm(d) }
  return { day: 'original', iso }
}

/** A choice that can't be saved yet (e.g. a time later today), with the reason. */
export function whenProblem(c: WhenChoice, now = new Date()): string | null {
  const iso = whenToIso(c, now)
  if (!iso) return null
  const check = validateLoggedAt(iso, now)
  return check.ok ? null : check.error
}
