import { describe, expect, it } from 'vitest'
import { GOAL_MAX, GOAL_MIN, calculateDailyGoal, effectiveGoal, goalBreakdown, motivationalMessage } from '../hydration'

describe('goalBreakdown', () => {
  it('adjusts the weight baseline for sex and activity, rounded to 50 ml', () => {
    expect(goalBreakdown({ weightKg: 70, gender: 'female', activity: 'moderate' })).toEqual({
      base: 2310,
      genderAdj: -116,
      activityAdj: 600,
      total: 2800,
    })
    expect(calculateDailyGoal({ weightKg: 70, gender: 'male', activity: 'sedentary' })).toBe(2450)
  })

  it('clamps to the goal range', () => {
    expect(calculateDailyGoal({ weightKg: 25, gender: 'female', activity: 'sedentary' })).toBe(GOAL_MIN)
    expect(calculateDailyGoal({ weightKg: 300, gender: 'male', activity: 'athlete' })).toBe(GOAL_MAX)
  })

  it('falls back to 70 kg when weight is missing', () => {
    expect(calculateDailyGoal({ weightKg: NaN, gender: 'unspecified', activity: 'sedentary' })).toBe(2300)
  })
})

describe('effectiveGoal', () => {
  const profile = { weight_kg: 70, gender: 'unspecified' as const, activity_level: 'sedentary' as const }

  it('prefers a custom goal', () => {
    expect(effectiveGoal({ ...profile, custom_goal_ml: 1800 })).toBe(1800)
  })

  it('otherwise calculates one', () => {
    expect(effectiveGoal({ ...profile, custom_goal_ml: null })).toBe(2300)
  })
})

describe('motivationalMessage', () => {
  const morning = new Date(2026, 9, 7, 9)

  it('is stable for the same day and bucket', () => {
    expect(motivationalMessage(0.4, morning)).toBe(motivationalMessage(0.6, new Date(2026, 9, 7, 11)))
  })

  it('switches to evening catch-up copy when behind after 6pm', () => {
    expect(motivationalMessage(0.2, new Date(2026, 9, 7, 19))).toMatch(/evening|still time/i)
  })
})
