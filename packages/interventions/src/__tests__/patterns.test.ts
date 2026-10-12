import { describe, expect, it } from 'vitest'
import { patternInterventions, type PatternInput } from '../patterns'

const now = new Date(2026, 9, 15, 19) // Thu 15 Oct 2026, 7 pm
const day = (n: number, h = 10) => new Date(2026, 9, 15 - n, h).toISOString()
const k = (n: number) => { const d = new Date(2026, 9, 15 - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const mood = (n: number, state: 'awful' | 'bad' | 'okay' | 'good' | 'great', stress: number | null = null) =>
  ({ id: `m${n}${state}`, mood_state: state, energy_level: null, stress_level: stress, emotions: [], note: null, logged_at: day(n) })
const base: PatternInput = { now, moods: [], activeDays: new Set([k(0), k(1), k(2)]), waterDaysLast7: 0, water: null, exerciseWeekMin: 30, waterGoalStreak: 0, accountAgeDays: 30 }
const rules = (i: Partial<PatternInput>) => patternInterventions({ ...base, ...i }).map((x) => x.rule)

describe('pattern nudges', () => {
  it('flags 3+ low-mood days in the week, pointing to a therapist', () => {
    const r = patternInterventions({ ...base, moods: [mood(0, 'bad'), mood(2, 'awful'), mood(5, 'bad'), mood(3, 'good')] })
    expect(r[0]).toMatchObject({ rule: 'mood-pattern', severity: 'WARNING', actions: [{ contact: 'therapist' }] })
  })
  it('ignores low days older than a week, and averages a mixed day', () => {
    expect(rules({ moods: [mood(0, 'bad'), mood(1, 'bad'), mood(9, 'awful')] })).not.toContain('mood-pattern')
    expect(rules({ moods: [mood(0, 'bad'), mood(0, 'great'), mood(1, 'bad'), mood(2, 'bad')] })).not.toContain('mood-pattern')
  })
  it('suggests a therapist for high stress on 3+ days (when mood alone wouldn’t)', () => {
    expect(rules({ moods: [mood(0, 'okay', 5), mood(1, 'good', 4), mood(3, 'okay', 4)] })).toContain('stress-pattern')
  })
  it('welcomes people back after 3+ quiet days, and nudges after a lapse', () => {
    expect(rules({ activeDays: new Set([k(0), k(5)]) })).toContain('welcome-back')
    expect(rules({ activeDays: new Set([k(4)]) })).toContain('lapse')
    expect(rules({ activeDays: new Set([k(1)]) })).not.toContain('lapse')
    expect(rules({ activeDays: new Set(), accountAgeDays: 1 })).not.toContain('lapse')
  })
  it('nudges exercise from Thursday when the week is empty', () => {
    expect(rules({ exerciseWeekMin: 0 })).toContain('exercise-nudge')
    expect(rules({ exerciseWeekMin: 0, now: new Date(2026, 9, 13, 19) })).not.toContain('exercise-nudge') // Tuesday
  })
  it('suggests water in the evening only for people who track it', () => {
    expect(rules({ water: { todayMl: 800, goalMl: 2500 }, waterDaysLast7: 4 })).toContain('water-nudge')
    expect(rules({ water: { todayMl: 800, goalMl: 2500 }, waterDaysLast7: 0 })).not.toContain('water-nudge')
    expect(rules({ water: { todayMl: 1500, goalMl: 2500 }, waterDaysLast7: 4 })).not.toContain('water-nudge')
    expect(rules({ water: { todayMl: 800, goalMl: 2500 }, waterDaysLast7: 4, now: new Date(2026, 9, 15, 15) })).not.toContain('water-nudge')
  })
  it('cheers water streak milestones', () => {
    const r = patternInterventions({ ...base, waterGoalStreak: 7 })
    expect(r.find((x) => x.rule === 'streak-milestone')).toMatchObject({ severity: 'CHEER', title: '7 days in a row!' })
    expect(rules({ waterGoalStreak: 8 })).not.toContain('streak-milestone')
  })
})
