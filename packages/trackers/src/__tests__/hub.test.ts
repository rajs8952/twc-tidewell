import { describe, expect, it } from 'vitest'
import { EXERCISE_TARGET_MIN, hubSummaries, MEDITATION_TARGET_MIN, type TrackerData } from '../hub'
import { TRACKERS } from '../registry'

// Wednesday 7 Oct 2026, 2 pm local.
const now = new Date(2026, 9, 7, 14)
const at = (day: number, hour = 9) => new Date(2026, 9, day, hour).toISOString()
const empty: TrackerData = {
  mood: { ok: true, data: [] },
  meditation: { ok: true, data: [] },
  sleep: { ok: true, data: [] },
  weight: { ok: true, data: [] },
  exercise: { ok: true, data: [] },
}

describe('hubSummaries', () => {
  it('has a summary for every registered tracker', () => {
    expect(Object.keys(hubSummaries(empty, { todayMl: 0, goalMl: 2000 }, now)).sort()).toEqual(TRACKERS.map((t) => t.id).sort())
  })

  it('fills water toward the goal', () => {
    const s = hubSummaries(empty, { todayMl: 1500, goalMl: 2000 }, now).water
    expect(s).toMatchObject({ progress: 0.75, done: false, value: '1,500 ml', caption: 'of 2,000 ml today' })
    expect(hubSummaries(empty, { todayMl: 2600, goalMl: 2000 }, now).water).toMatchObject({ progress: 1, done: true })
  })

  it('counts only today for mood, meditation and exercise', () => {
    const data: TrackerData = {
      ...empty,
      mood: { ok: true, data: [
        { id: 'a', mood_state: 'good', energy_level: null, stress_level: null, emotions: [], note: null, logged_at: at(7, 10) },
        { id: 'b', mood_state: 'bad', energy_level: null, stress_level: null, emotions: [], note: null, logged_at: at(6) },
      ] },
      meditation: { ok: true, data: [
        { id: 'm', duration_min: 5, session_type: 'breathing', calm_before: null, calm_after: null, note: null, logged_at: at(7) },
        { id: 'n', duration_min: 30, session_type: 'breathing', calm_before: null, calm_after: null, note: null, logged_at: at(6) },
      ] },
      exercise: { ok: true, data: [
        { id: 'e', activity: 'running', duration_min: 45, intensity: 'moderate', calories_kcal: null, distance_km: null, note: null, logged_at: at(7) },
      ] },
    }
    const s = hubSummaries(data, null, now)
    expect(s.mood).toMatchObject({ done: true, value: 'Good', caption: '1 check-in today' })
    expect(s.meditation).toMatchObject({ progress: 5 / MEDITATION_TARGET_MIN, done: false, value: '5 min' })
    expect(s.exercise).toMatchObject({ progress: 1, done: true, value: '45 min', caption: `of ${EXERCISE_TARGET_MIN} min today` })
  })

  it('completes sleep from 7 hours ending this morning', () => {
    const night = (hours: number) => ({
      ...empty,
      sleep: { ok: true as const, data: [{ id: 's', bed_at: at(6, 23), wake_at: at(7, 7), duration_min: hours * 60, quality: 4, awakenings: null, note: null, logged_at: at(7, 7) }] },
    })
    expect(hubSummaries(night(7.5), null, now).sleep).toMatchObject({ done: true, value: '7h 30m', caption: 'last night' })
    expect(hubSummaries(night(6), null, now).sleep).toMatchObject({ done: false })
  })

  it('keeps weight done for a week after a weigh-in', () => {
    const weighed = (date: Date) => ({ ...empty, weight: { ok: true as const, data: [{ id: 'w', weight_kg: 72.44, body_fat_pct: null, note: null, logged_at: date.toISOString() }] } })
    expect(hubSummaries(weighed(new Date(2026, 9, 6, 9)), null, now).weight).toMatchObject({ done: true, value: '72.4 kg', caption: 'yesterday' })
    expect(hubSummaries(weighed(new Date(2026, 9, 1, 9)), null, now).weight).toMatchObject({ done: true, caption: '6 days ago' })
    expect(hubSummaries(weighed(new Date(2026, 8, 30, 9)), null, now).weight).toMatchObject({ done: false, caption: '7 days ago · due' })
    expect(hubSummaries(empty, null, now).weight).toMatchObject({ done: false, value: 'No weigh-in' })
  })

  it('marks a tracker that failed to load, without affecting the others', () => {
    const s = hubSummaries({ ...empty, sleep: { ok: false, error: 'offline' } }, null, now)
    expect(s.sleep).toMatchObject({ progress: null, value: '—', caption: 'Couldn’t load right now' })
    expect(s.water.progress).toBeNull()
    expect(s.mood.progress).toBe(0)
  })
})
