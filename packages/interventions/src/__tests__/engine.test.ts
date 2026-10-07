import { describe, expect, it } from 'vitest'
import { evaluateMetric, latestInterventions, moodInterventionKey, mostSevere, RULES } from '../index'

const now = new Date(2026, 9, 7, 14)

describe('mood', () => {
  it('raises a crisis prompt with the helpline first for an awful mood', () => {
    for (const value of [1, 'awful'] as const) {
      const r = evaluateMetric({ type: 'mood', value })
      expect(r).toMatchObject({ severity: 'CRITICAL', rule: 'mood-critical', showEmergencyNote: true })
      expect(r.actions.map((a) => [a.kind, a.contact])).toEqual([['call', 'eap'], ['chat', 'therapist']])
    }
  })

  it('stays normal for every other mood', () => {
    for (const value of ['bad', 'okay', 'good', 'great', 2, 5] as const) {
      expect(evaluateMetric({ type: 'mood', value }).severity).toBe('NORMAL')
    }
  })

  it('rejects impossible scores instead of guessing', () => {
    expect(() => evaluateMetric({ type: 'mood', value: 0 })).toThrow(RangeError)
    expect(() => evaluateMetric({ type: 'mood', value: 'meh' as never })).toThrow(RangeError)
  })
})

describe('sleep', () => {
  it.each([
    [4.5, 'WARNING', 'sleep-short'],
    [RULES.sleepMinHours, 'NORMAL', 'normal'],
    [RULES.sleepMaxHours, 'NORMAL', 'normal'],
    [9.25, 'WARNING', 'sleep-long'],
  ])('%f h → %s', (hours, severity, rule) => {
    expect(evaluateMetric({ type: 'sleep', value: hours })).toMatchObject({ severity, rule })
  })

  it('formats the hours in the message', () => {
    expect(evaluateMetric({ type: 'sleep', value: 4.5 }).message).toContain('4 h 30 min')
  })
})

describe('weight', () => {
  it('suggests the dietitian from BMI 25', () => {
    expect(evaluateMetric({ type: 'weight', value: 77 }, { heightCm: 175 })).toMatchObject({ severity: 'SUGGESTION', rule: 'bmi-high' })
    expect(evaluateMetric({ type: 'weight', value: 70 }, { heightCm: 175 }).severity).toBe('NORMAL')
  })

  it('says what is missing without a height', () => {
    expect(evaluateMetric({ type: 'weight', value: 90 })).toMatchObject({ severity: 'NORMAL', missing: 'height' })
  })
})

describe('combining', () => {
  it('mostSevere picks the highest severity, first on a tie', () => {
    const warn = evaluateMetric({ type: 'sleep', value: 3 })
    const crit = evaluateMetric({ type: 'mood', value: 1 })
    expect(mostSevere([warn, crit])).toBe(crit)
    expect(mostSevere([])).toBeNull()
  })

  it('latestInterventions uses today’s mood, last night’s sleep and the latest weight, most severe first', () => {
    const r = latestInterventions(
      {
        mood: [{ id: 'm', mood_state: 'awful', energy_level: null, stress_level: null, emotions: [], note: null, logged_at: new Date(2026, 9, 7, 9).toISOString() }],
        sleep: [{ id: 's', bed_at: '', wake_at: new Date(2026, 9, 7, 6).toISOString(), duration_min: 240, quality: 2, awakenings: null, note: null, logged_at: '' }],
        weight: [{ id: 'w', weight_kg: 80, body_fat_pct: null, note: null, logged_at: '' }],
      },
      { height_cm: 170, weight_kg: 75 },
      now,
    )
    expect(r.map((i) => [i.rule, i.key])).toEqual([
      ['mood-critical', moodInterventionKey(r[0], now)],
      ['sleep-short', 'sleep-short:s'],
      ['bmi-high', 'bmi-high:2026-10'],
    ])
  })

  it('ignores yesterday’s mood and an old night', () => {
    const r = latestInterventions(
      {
        mood: [{ id: 'm', mood_state: 'awful', energy_level: null, stress_level: null, emotions: [], note: null, logged_at: new Date(2026, 9, 6, 22).toISOString() }],
        sleep: [{ id: 's', bed_at: '', wake_at: new Date(2026, 9, 6, 6).toISOString(), duration_min: 200, quality: 2, awakenings: null, note: null, logged_at: '' }],
      },
      null,
      now,
    )
    expect(r).toEqual([])
  })
})
