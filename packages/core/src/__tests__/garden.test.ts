import { describe, expect, it } from 'vitest'
import { addDays, dayKey } from '../dates'
import { GROW_TARGET, computeGarden, moodFor } from '../garden'

const today = new Date(2026, 9, 7, 12)
const goal = 2000
const daysBack = (n: number) => dayKey(addDays(today, -n))

describe('computeGarden', () => {
  it('starts with a seed and no history', () => {
    const g = computeGarden({}, goal, today)
    expect(g.current).toMatchObject({ number: 1, growth: 0, plantedOn: dayKey(today) })
    expect(g.grown).toEqual([])
    expect(g.mood).toBe('thirsty')
    expect(g.daysToBloom).toBe(GROW_TARGET - 1)
  })

  it('blooms after GROW_TARGET full days and starts the next plant', () => {
    const totals = Object.fromEntries(Array.from({ length: GROW_TARGET }, (_, i) => [daysBack(i), goal]))
    const g = computeGarden(totals, goal, today)
    expect(g.grown).toEqual([{ species: 'sunflower', bloomedOn: dayKey(today), days: GROW_TARGET }])
    expect(g.current).toMatchObject({ number: 2, species: 'tulip', growth: 0 })
    expect(g.mood).toBe('thriving')
    expect(g.droop).toBe(0)
  })

  it('caps each day at one full share of growth', () => {
    const g = computeGarden({ [daysBack(1)]: goal * 3 }, goal, today)
    expect(g.current.growth).toBe(1)
  })

  it('wilts after a dry yesterday', () => {
    const g = computeGarden({ [daysBack(3)]: goal }, goal, today)
    expect(g.mood).toBe('wilting')
  })
})

describe('moodFor', () => {
  it.each([
    [1, false, 'thriving'],
    [0.5, true, 'happy'],
    [0.1, true, 'thirsty'],
    [0, false, 'thirsty'],
    [0, true, 'wilting'],
  ] as const)('progress %f, missed %s → %s', (p, missed, mood) => {
    expect(moodFor(p, missed)).toBe(mood)
  })
})
