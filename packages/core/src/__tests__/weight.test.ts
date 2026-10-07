import { describe, expect, it } from 'vitest'
import { formatChange, formatWeight, fromUnit, toUnit, validateWeightInput } from '../weight'

describe('unit conversion', () => {
  it('round-trips kg ↔ lb', () => {
    expect(fromUnit(toUnit(80, 'lb'), 'lb')).toBeCloseTo(80, 10)
    expect(toUnit(80, 'kg')).toBe(80)
  })

  it('formats in the chosen unit', () => {
    expect(formatWeight(72.44, 'kg')).toBe('72.4 kg')
    expect(formatWeight(72.4, 'lb')).toBe('159.6 lb')
  })

  it('signs changes, with ± for no change', () => {
    expect(formatChange(0.27, 'kg')).toBe('+0.3 kg')
    expect(formatChange(-1, 'lb')).toBe('−2.2 lb')
    expect(formatChange(0.01, 'kg')).toBe('±0.0 kg')
  })
})

describe('validateWeightInput', () => {
  it('rounds to 0.1 and trims the note', () => {
    expect(validateWeightInput({ weight_kg: 72.44, body_fat_pct: 18.26, note: '  after run ', sync_profile: true })).toEqual({
      ok: true,
      value: { weight_kg: 72.4, body_fat_pct: 18.3, note: 'after run', sync_profile: true },
    })
  })

  it('treats a missing body fat as null', () => {
    const r = validateWeightInput({ weight_kg: 70 })
    expect(r.ok && r.value.body_fat_pct).toBeNull()
  })

  it.each([
    [{ weight_kg: 24.9 }, 'Weight must be between 25 and 300 kg.'],
    [{ weight_kg: '70' }, 'Weight must be between 25 and 300 kg.'],
    [{ weight_kg: 70, body_fat_pct: 80 }, 'Body fat must be between 2% and 75%.'],
    [{ weight_kg: 70, note: 'x'.repeat(1001) }, 'Notes can be up to 1,000 characters.'],
  ])('rejects %j', (input, error) => {
    expect(validateWeightInput(input)).toEqual({ ok: false, error })
  })
})
