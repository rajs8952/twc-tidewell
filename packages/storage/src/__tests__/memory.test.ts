import { describe, expect, it } from 'vitest'
import { createLocalStorage } from '../local'
import { createMemoryStorage } from '../memory'

const clock = (iso: string) => () => new Date(iso)
let n = 0
const id = () => `id-${++n}`

describe('createMemoryStorage', () => {
  it('validates like the server and fills in id and logged_at', async () => {
    const s = createMemoryStorage({ now: clock('2026-10-07T09:00:00Z'), id })
    expect(await s.mood.create({ mood_state: 'meh' } as never)).toEqual({ ok: false, error: 'Pick how you feel first.' })
    const r = await s.mood.create({ mood_state: 'good', emotions: ['calm', 'calm'], note: '  ok ' })
    expect(r).toEqual({ ok: true, data: { id: expect.any(String), logged_at: '2026-10-07T09:00:00.000Z', mood_state: 'good', energy_level: null, stress_level: null, emotions: ['calm'], note: 'ok' } })
  })

  it('computes sleep duration the way the database does', async () => {
    const s = createMemoryStorage({ now: clock('2026-10-07T09:00:00Z') })
    const r = await s.sleep.create({ bed_at: '2026-10-06T22:15:00Z', wake_at: '2026-10-07T06:45:00Z', quality: 4 })
    expect(r.ok && r.data.duration_min).toBe(510)
  })

  it('lists [from, to) newest first, by each tracker’s time column', async () => {
    const s = createMemoryStorage({
      initial: {
        sleep: [
          { id: 'a', bed_at: '', wake_at: '2026-10-05T06:00:00Z', duration_min: 400, quality: 3, awakenings: null, note: null, logged_at: '2026-10-07T00:00:00Z' },
          { id: 'b', bed_at: '', wake_at: '2026-10-06T06:00:00Z', duration_min: 400, quality: 3, awakenings: null, note: null, logged_at: '2026-10-01T00:00:00Z' },
          { id: 'c', bed_at: '', wake_at: '2026-10-07T06:00:00Z', duration_min: 400, quality: 3, awakenings: null, note: null, logged_at: '2026-10-01T00:00:00Z' },
        ],
      },
    })
    const r = await s.sleep.list({ from: '2026-10-05T06:00:00Z', to: '2026-10-07T06:00:00Z' })
    expect(r.ok && r.data.map((l) => l.id)).toEqual(['b', 'a'])
    expect(await s.sleep.list({ from: 'soon', to: 'later' })).toEqual({ ok: false, error: 'Invalid date range.' })
  })

  it('returns copies, so callers can’t change stored data', async () => {
    const s = createMemoryStorage()
    await s.mood.create({ mood_state: 'good' })
    const first = await s.mood.list({ from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' })
    if (first.ok) first.data.push(first.data[0])
    const again = await s.mood.list({ from: '2000-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' })
    expect(again.ok && again.data).toHaveLength(1)
  })

  it('syncs the profile weight only when asked', async () => {
    const s = createMemoryStorage()
    expect(await s.weight.create({ weight_kg: 80.04 })).toMatchObject({ ok: true, data: { log: { weight_kg: 80 }, profileSynced: false } })
    expect((await s.profile.get()).weight_kg).toBe(70)
    expect(await s.weight.create({ weight_kg: 81, sync_profile: true })).toMatchObject({ ok: true, data: { profileSynced: true } })
    expect((await s.profile.get()).weight_kg).toBe(81)
  })

  it('removes entries, and treats a missing id as already removed', async () => {
    const s = createMemoryStorage()
    const r = await s.exercise.create({ activity: 'yoga', duration_min: 30, intensity: 'light' })
    if (!r.ok) throw new Error(r.error)
    expect(await s.exercise.remove(r.data.id)).toEqual({ ok: true, data: null })
    expect(await s.exercise.remove('gone')).toEqual({ ok: true, data: null })
    expect(s.snapshot().exercise).toEqual([])
  })

  it('applies drink multipliers and totals by local day', async () => {
    let now = new Date(2026, 9, 6, 20)
    const s = createMemoryStorage({ now: () => now })
    expect((await s.water.add('coffee', 250)).effective_ml).toBe(200)
    now = new Date(2026, 9, 7, 8)
    await s.water.add('water', 500)
    await s.water.add('tea', 300)
    expect(await s.water.dailyTotals()).toEqual({ '2026-10-06': 200, '2026-10-07': 770 })
    expect(await s.water.dailyTotals(1)).toEqual({ '2026-10-07': 770 })
    await expect(s.water.add('water', 0)).rejects.toThrow('between 1 and 5,000 ml')
    await expect(s.water.add('soda' as never, 250)).rejects.toThrow('Unknown drink.')
  })
})

describe('createLocalStorage', () => {
  const fake = () => {
    const items = new Map<string, string>()
    return { items, getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) }
  }

  it('saves every change and picks it up again', async () => {
    const storage = fake()
    const a = createLocalStorage({ storage })
    await a.mood.create({ mood_state: 'great' })
    await a.profile.update('local', { height_cm: 180 })
    const b = createLocalStorage({ storage })
    expect(b.snapshot().mood).toHaveLength(1)
    expect((await b.profile.get()).height_cm).toBe(180)
    expect([...storage.items.keys()]).toEqual(['omniwell:trackers'])
  })

  it('starts fresh from unreadable data, and keeps working when saving fails', async () => {
    const storage = fake()
    storage.items.set('omniwell:trackers', '{not json')
    const s = createLocalStorage({ storage: { getItem: storage.getItem, setItem: () => { throw new Error('quota') } } })
    expect(s.snapshot().mood).toEqual([])
    expect((await s.mood.create({ mood_state: 'okay' })).ok).toBe(true)
  })
})
