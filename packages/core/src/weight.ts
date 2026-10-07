/* ------------------------------------------------------------------
 * Weight tracker: shared constants, types, validation and helpers.
 * Weight is always stored in kg; lb is a display preference.
 * ------------------------------------------------------------------ */

import { addDays, startOfDay } from './dates'
import type { DateRange } from './types'

export type { ActionResult, DateRange } from './types'

export const MIN_KG = 25
export const MAX_KG = 300
export const MIN_FAT = 2
export const MAX_FAT = 75
export const LB_PER_KG = 2.20462

export type WeightUnit = 'kg' | 'lb'

/** Chart window choices, in days. */
export const RANGES = [30, 90] as const

export interface WeightLog {
  id: string
  weight_kg: number
  body_fat_pct: number | null
  note: string | null
  logged_at: string
}

export interface WeightInput {
  weight_kg: number
  body_fat_pct?: number | null
  note?: string | null
  /** Also set profiles.weight_kg, which the water goal is calculated from. */
  sync_profile?: boolean
}

export const round1 = (n: number) => Math.round(n * 10) / 10

export const toUnit = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg * LB_PER_KG)
export const fromUnit = (value: number, unit: WeightUnit) => (unit === 'kg' ? value : value / LB_PER_KG)

/** "72.4 kg" / "159.6 lb". */
export const formatWeight = (kg: number, unit: WeightUnit) => `${round1(toUnit(kg, unit)).toFixed(1)} ${unit}`

/** "+0.6 kg", "−1.2 lb", "±0.0 kg". */
export function formatChange(kgDelta: number, unit: WeightUnit) {
  const v = round1(toUnit(kgDelta, unit))
  const sign = v > 0 ? '+' : v < 0 ? '−' : '±'
  return `${sign}${Math.abs(v).toFixed(1)} ${unit}`
}

/** Supabase returns numeric columns as strings; normalise a row. */
export function toWeightLog(r: Record<string, unknown>): WeightLog {
  return {
    id: r.id as string,
    weight_kg: Number(r.weight_kg),
    body_fat_pct: r.body_fat_pct == null ? null : Number(r.body_fat_pct),
    note: (r.note as string | null) ?? null,
    logged_at: r.logged_at as string,
  }
}

/** Mirrors the CHECK constraints on weight_logs in supabase/wellness.sql. Values are rounded to 0.1. */
export function validateWeightInput(input: unknown): { ok: true; value: WeightInput } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Missing weight.' }
  const i = input as Record<string, unknown>

  const kg = typeof i.weight_kg === 'number' ? round1(i.weight_kg) : NaN
  if (!Number.isFinite(kg) || kg < MIN_KG || kg > MAX_KG) {
    return { ok: false, error: `Weight must be between ${MIN_KG} and ${MAX_KG} kg.` }
  }

  let fat: number | null = null
  if (i.body_fat_pct != null) {
    fat = typeof i.body_fat_pct === 'number' ? round1(i.body_fat_pct) : NaN
    if (!Number.isFinite(fat) || fat < MIN_FAT || fat > MAX_FAT) {
      return { ok: false, error: `Body fat must be between ${MIN_FAT}% and ${MAX_FAT}%.` }
    }
  }

  const note = typeof i.note === 'string' ? i.note.trim() : null
  if (note && note.length > 1000) return { ok: false, error: 'Notes can be up to 1,000 characters.' }

  return { ok: true, value: { weight_kg: kg, body_fat_pct: fat, note: note || null, sync_profile: i.sync_profile === true } }
}

/** What the Weight card shows: the longest chart range (90 days) through today. */
export const weightRange = (now = new Date()): DateRange => {
  const end = addDays(startOfDay(now), 1)
  return { from: addDays(end, -Math.max(...RANGES)).toISOString(), to: end.toISOString() }
}
