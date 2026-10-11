import { describe, expect, it } from 'vitest'
import { validateExerciseInput } from '../exercise'
import { validateMoodInput } from '../mood'
import { MAX_BACKDATE_DAYS, validateLoggedAt, whenFromIso, whenProblem, whenToIso } from '../when'

const now = new Date(2026, 9, 11, 14, 30) // Sun 11 Oct 2026, 14:30 local

describe('validateLoggedAt', () => {
  it('treats a missing time as now', () => {
    expect(validateLoggedAt(undefined, now)).toEqual({ ok: true })
    expect(validateLoggedAt('', now)).toEqual({ ok: true })
  })
  it('accepts earlier today and yesterday', () => {
    expect(validateLoggedAt(new Date(2026, 9, 11, 9).toISOString(), now).ok).toBe(true)
    expect(validateLoggedAt(new Date(2026, 9, 10, 21).toISOString(), now).ok).toBe(true)
  })
  it('refuses the future (beyond a few minutes of clock drift)', () => {
    expect(validateLoggedAt(new Date(2026, 9, 11, 14, 33).toISOString(), now).ok).toBe(true)
    expect(validateLoggedAt(new Date(2026, 9, 11, 18).toISOString(), now)).toMatchObject({ ok: false, error: 'That time is in the future.' })
  })
  it(`refuses more than ${MAX_BACKDATE_DAYS} days back, and junk`, () => {
    expect(validateLoggedAt(new Date(2026, 9, 1).toISOString(), now).ok).toBe(false)
    expect(validateLoggedAt('not a date', now).ok).toBe(false)
    expect(validateLoggedAt(42, now).ok).toBe(false)
  })
})

describe('when choices', () => {
  it('turns choices into times', () => {
    expect(whenToIso({ day: 'now' }, now)).toBeUndefined()
    expect(whenToIso({ day: 'yesterday', time: '21:15' }, now)).toBe(new Date(2026, 9, 10, 21, 15).toISOString())
    expect(whenToIso({ day: 'today', time: '08:00' }, now)).toBe(new Date(2026, 9, 11, 8, 0).toISOString())
  })
  it('reads an entry’s time back as a choice', () => {
    expect(whenFromIso(new Date(2026, 9, 11, 7, 5).toISOString(), now)).toEqual({ day: 'today', time: '07:05' })
    expect(whenFromIso(new Date(2026, 9, 10, 22, 0).toISOString(), now)).toEqual({ day: 'yesterday', time: '22:00' })
    const old = new Date(2026, 9, 6, 9).toISOString()
    expect(whenFromIso(old, now)).toEqual({ day: 'original', iso: old })
  })
  it('flags a time later today before saving', () => {
    expect(whenProblem({ day: 'today', time: '20:00' }, now)).toBe('That time is in the future.')
    expect(whenProblem({ day: 'yesterday', time: '20:00' }, now)).toBeNull()
  })
})

describe('validators carry logged_at', () => {
  it('passes a valid time through, and leaves it out when absent', () => {
    const t = new Date(Date.now() - 3_600_000).toISOString()
    const withTime = validateMoodInput({ mood_state: 'good', logged_at: t })
    expect(withTime.ok && withTime.value.logged_at).toBe(t)
    const without = validateMoodInput({ mood_state: 'good' })
    expect(without.ok && 'logged_at' in without.value).toBe(false)
  })
  it('rejects a future time', () => {
    const r = validateExerciseInput({ activity: 'walking', duration_min: 20, intensity: 'moderate', logged_at: new Date(Date.now() + 86_400_000).toISOString() })
    expect(r.ok).toBe(false)
  })
})
