import { describe, expect, it } from 'vitest'
import { addDays, computeStreaks, dayKey, greeting, parseDayKey, startOfDay, startOfWeek } from '../dates'

// Wednesday 7 Oct 2026, local time.
const wed = new Date(2026, 9, 7, 12, 30)

describe('day keys', () => {
  it('formats local dates with zero padding', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('round-trips through parseDayKey', () => {
    expect(dayKey(parseDayKey('2026-02-28'))).toBe('2026-02-28')
    expect(parseDayKey('2026-02-28').getHours()).toBe(0)
  })
})

describe('date arithmetic', () => {
  it('startOfDay drops the time', () => {
    expect(startOfDay(wed).getTime()).toBe(new Date(2026, 9, 7).getTime())
  })

  it('addDays crosses month and year boundaries without mutating', () => {
    const d = new Date(2026, 11, 31)
    expect(dayKey(addDays(d, 1))).toBe('2027-01-01')
    expect(dayKey(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28')
    expect(dayKey(d)).toBe('2026-12-31')
  })

  it('weeks start on Monday', () => {
    expect(dayKey(startOfWeek(wed))).toBe('2026-10-05')
    expect(dayKey(startOfWeek(new Date(2026, 9, 5)))).toBe('2026-10-05')
    // Sunday belongs to the week that started six days earlier.
    expect(dayKey(startOfWeek(new Date(2026, 9, 11)))).toBe('2026-10-05')
  })
})

describe('computeStreaks', () => {
  const goal = 2000

  it('does not break the streak before today is finished', () => {
    const s = computeStreaks({ '2026-10-05': 2000, '2026-10-06': 2500, '2026-10-07': 500 }, goal, wed)
    expect(s).toEqual({ current: 2, best: 2, todayMet: false })
  })

  it('counts today once it is met', () => {
    const s = computeStreaks({ '2026-10-05': 2000, '2026-10-06': 2500, '2026-10-07': 2000 }, goal, wed)
    expect(s).toEqual({ current: 3, best: 3, todayMet: true })
  })

  it('keeps the longest past run as best', () => {
    const totals = {
      '2026-09-01': 2000,
      '2026-09-02': 2000,
      '2026-09-03': 2000,
      '2026-09-04': 2000,
      '2026-10-06': 2000,
    }
    expect(computeStreaks(totals, goal, wed)).toEqual({ current: 1, best: 4, todayMet: false })
  })

  it('treats a gap as a reset', () => {
    expect(computeStreaks({ '2026-10-05': 2000 }, goal, wed).current).toBe(0)
    expect(computeStreaks({}, goal, wed)).toEqual({ current: 0, best: 0, todayMet: false })
  })
})

describe('greeting', () => {
  it.each([
    [2, 'Up late'],
    [9, 'Good morning'],
    [14, 'Good afternoon'],
    [20, 'Good evening'],
  ])('%i:00 → %s', (hour, text) => {
    expect(greeting(new Date(2026, 9, 7, hour))).toBe(text)
  })
})
