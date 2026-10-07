import { describe, expect, it } from 'vitest'
import { bedDate, formatDuration, validateSleepInput, wakeDate } from '../sleep'

const now = Date.parse('2026-10-07T08:00:00Z')
const valid = { bed_at: '2026-10-06T22:00:00Z', wake_at: '2026-10-07T06:30:00Z', quality: 4 }

describe('validateSleepInput', () => {
  it('accepts a normal night', () => {
    expect(validateSleepInput(valid, now)).toEqual({
      ok: true,
      value: { bed_at: '2026-10-06T22:00:00.000Z', wake_at: '2026-10-07T06:30:00.000Z', quality: 4, awakenings: null, note: null },
    })
  })

  it.each([
    [{ ...valid, wake_at: 'soon' }, 'Bedtime and wake time are required.'],
    [{ ...valid, wake_at: valid.bed_at }, 'Wake time must be after bedtime.'],
    [{ ...valid, wake_at: '2026-10-06T22:10:00Z' }, 'Sleeps under 15 minutes aren’t logged.'],
    [{ ...valid, bed_at: '2026-10-05T06:00:00Z' }, 'A sleep can be at most 24 hours.'],
    [{ ...valid, wake_at: '2026-10-07T08:30:00Z' }, 'That wake time is in the future.'],
    [{ ...valid, quality: 0 }, 'Rate how well you slept.'],
    [{ ...valid, awakenings: 51 }, 'Wake-ups must be between 0 and 50.'],
  ])('rejects %j', (input, error) => {
    expect(validateSleepInput(input, now)).toEqual({ ok: false, error })
  })

  it('allows a few minutes of clock skew', () => {
    expect(validateSleepInput({ ...valid, wake_at: '2026-10-07T08:05:00Z' }, now).ok).toBe(true)
  })
})

describe('sleep times', () => {
  it('formats durations', () => {
    expect(formatDuration(450)).toBe('7 h 30 min')
    expect(formatDuration(480)).toBe('8 h')
    expect(formatDuration(45)).toBe('45 min')
  })

  it('builds the wake time on today or yesterday', () => {
    const today = new Date(2026, 9, 7, 12)
    expect(wakeDate('07:15', 0, today).getTime()).toBe(new Date(2026, 9, 7, 7, 15).getTime())
    expect(wakeDate('07:15', -1, today).getTime()).toBe(new Date(2026, 9, 6, 7, 15).getTime())
  })

  it('works back to bedtime from hours slept', () => {
    const wake = new Date('2026-10-07T06:30:00Z')
    expect(bedDate(wake, 7.5).toISOString()).toBe('2026-10-06T23:00:00.000Z')
  })
})
