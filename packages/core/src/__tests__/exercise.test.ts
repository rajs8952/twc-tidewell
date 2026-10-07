import { describe, expect, it } from 'vitest'
import { estimateKcal, formatMinutes, validateExerciseInput } from '../exercise'

describe('estimateKcal', () => {
  it('is MET × kg × hours, rounded', () => {
    expect(estimateKcal('running', 'moderate', 30, 70)).toBe(343)
    expect(estimateKcal('walking', 'light', 60, 80)).toBe(224)
    expect(estimateKcal('hiit', 'vigorous', 20, 60)).toBe(200)
  })

  it('scales linearly with duration and weight', () => {
    expect(estimateKcal('cycling', 'moderate', 60, 70)).toBe(2 * estimateKcal('cycling', 'moderate', 30, 70))
  })
})

describe('formatMinutes', () => {
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [95, '1 h 35 min'],
  ])('%i → %s', (min, text) => {
    expect(formatMinutes(min)).toBe(text)
  })
})

describe('validateExerciseInput', () => {
  const valid = { activity: 'running', duration_min: 30, intensity: 'moderate' }

  it('normalises a valid workout', () => {
    expect(validateExerciseInput({ ...valid, distance_km: 5.004, note: '  park loop ' })).toEqual({
      ok: true,
      value: { ...valid, calories_kcal: null, distance_km: 5, note: 'park loop' },
    })
  })

  it.each([
    [null, 'Missing workout details.'],
    [{ ...valid, activity: 'parkour' }, 'Pick an activity.'],
    [{ ...valid, duration_min: 0 }, 'Duration must be between 1 and 1440 minutes.'],
    [{ ...valid, duration_min: 12.5 }, 'Duration must be between 1 and 1440 minutes.'],
    [{ ...valid, intensity: 'extreme' }, 'Pick an intensity.'],
    [{ ...valid, calories_kcal: -1 }, 'Calories must be a whole number between 0 and 10,000.'],
    [{ ...valid, distance_km: 1001 }, 'Distance must be between 0 and 1,000 km.'],
  ])('rejects %j', (input, error) => {
    expect(validateExerciseInput(input)).toEqual({ ok: false, error })
  })
})
