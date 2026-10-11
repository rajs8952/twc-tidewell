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
    [8.25, 'NORMAL', 'normal'],
    [9.25, 'WARNING', 'sleep-long'],
  ])('%f h → %s', (hours, severity, rule) => {
    expect(evaluateMetric({ type: 'sleep', value: hours })).toMatchObject({ severity, rule })
  })

  it('points sleep worries to the therapist', () => {
    expect(evaluateMetric({ type: 'sleep', value: 10 }).actions[0]).toMatchObject({ contact: 'therapist' })
    expect(evaluateMetric({ type: 'sleep', value: 4 }).actions[0]).toMatchObject({ contact: 'therapist' })
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

describe('new users and weight', () => {
  const now = new Date(2026, 9, 7, 12)
  const weighIn = [{ id: 'w', weight_kg: 90, body_fat_pct: null, note: null, logged_at: '' }]
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

  it('never suggests from the sign-up weight alone (no weigh-ins)', () => {
    expect(latestInterventions({ weight: [] }, { height_cm: 170, weight_kg: 95, created_at: daysAgo(30) }, now)).toEqual([])
  })

  it('holds the BMI suggestion back in the first week', () => {
    expect(latestInterventions({ weight: weighIn }, { height_cm: 170, weight_kg: 90, created_at: daysAgo(2) }, now)).toEqual([])
  })

  it('suggests once the account is a week old', () => {
    const r = latestInterventions({ weight: weighIn }, { height_cm: 170, weight_kg: 90, created_at: daysAgo(8) }, now)
    expect(r.map((i) => i.rule)).toEqual(['bmi-high'])
  })

  it('never holds back a crisis, even on day one', () => {
    const mood = [{ id: 'm', mood_state: 'awful', energy_level: null, stress_level: null, emotion_tags: [], note: null, logged_at: now.toISOString() }]
    const r = latestInterventions({ mood: mood as never }, { height_cm: 170, weight_kg: 90, created_at: daysAgo(0) }, now)
    expect(r[0]?.severity).toBe('CRITICAL')
  })
})
