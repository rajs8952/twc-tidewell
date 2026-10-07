import { describe, expect, it } from 'vitest'
import { bmi, bmiBand, cmToFeetInches, feetInchesToCm, healthyWeightRange } from '../biometrics'

describe('bmi', () => {
  it('is weight over height squared, to one decimal', () => {
    expect(bmi(175, 70)).toBe(22.9)
  })

  it('needs both measurements', () => {
    expect(bmi(null, 70)).toBeNull()
    expect(bmi(175, null)).toBeNull()
  })
})

describe('bmiBand', () => {
  it.each([
    [18.4, 'Below the healthy range'],
    [18.5, 'In the healthy range'],
    [24.9, 'In the healthy range'],
    [25, 'Above the healthy range'],
    [30, 'Well above the healthy range'],
  ])('%f → %s', (value, label) => {
    expect(bmiBand(value).label).toBe(label)
  })

  it('positions the marker on a clamped 15–35 scale', () => {
    expect(bmiBand(25).position).toBe(0.5)
    expect(bmiBand(10).position).toBe(0)
    expect(bmiBand(40).position).toBe(1)
  })
})

describe('healthyWeightRange', () => {
  it('gives the weights for BMI 18.5–24.9', () => {
    expect(healthyWeightRange(175)).toEqual({ min: 56.7, max: 76.3 })
    expect(healthyWeightRange(null)).toBeNull()
  })
})

describe('imperial height', () => {
  it('round-trips feet and inches', () => {
    expect(cmToFeetInches(180)).toEqual({ ft: 5, in: 11 })
    expect(feetInchesToCm(5, 11)).toBe(180.3)
  })
})
