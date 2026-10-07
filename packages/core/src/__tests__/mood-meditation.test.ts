import { describe, expect, it } from 'vitest'
import { formatClock, formatMinutes, validateMeditationInput } from '../meditation'
import { validateMoodInput } from '../mood'

describe('validateMoodInput', () => {
  it('dedupes emotions and defaults optional levels to null', () => {
    expect(validateMoodInput({ mood_state: 'good', emotions: ['calm', 'calm', 'focused'], note: ' ' })).toEqual({
      ok: true,
      value: { mood_state: 'good', energy_level: null, stress_level: null, emotions: ['calm', 'focused'], note: null },
    })
  })

  it.each([
    [{}, 'Pick how you feel first.'],
    [{ mood_state: 'good', energy_level: 6 }, 'Energy must be between 1 and 5.'],
    [{ mood_state: 'good', stress_level: 2.5 }, 'Stress must be between 1 and 5.'],
    [{ mood_state: 'good', emotions: ['hangry'] }, 'Unknown emotion tag.'],
  ])('rejects %j', (input, error) => {
    expect(validateMoodInput(input)).toEqual({ ok: false, error })
  })
})

describe('validateMeditationInput', () => {
  const valid = { duration_min: 10, session_type: 'breathing', calm_before: 2, calm_after: 4 }

  it('accepts a session', () => {
    expect(validateMeditationInput(valid)).toEqual({ ok: true, value: { ...valid, note: null } })
  })

  it.each([
    [{ ...valid, duration_min: 0 }, 'Sessions must be between 1 and 600 minutes.'],
    [{ ...valid, session_type: 'nap' }, 'Pick a type of session.'],
    [{ ...valid, calm_after: 9 }, 'Calm ratings must be between 1 and 5.'],
  ])('rejects %j', (input, error) => {
    expect(validateMeditationInput(input)).toEqual({ ok: false, error })
  })
})

describe('meditation formatting', () => {
  it('counts down in mm:ss, never negative', () => {
    expect(formatClock(299.2)).toBe('05:00')
    expect(formatClock(59)).toBe('00:59')
    expect(formatClock(-3)).toBe('00:00')
  })

  it('formats session length', () => {
    expect(formatMinutes(65)).toBe('1 h 5 min')
    expect(formatMinutes(12)).toBe('12 min')
  })
})
