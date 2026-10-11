import { describe, expect, it } from 'vitest'
import { EXERCISE_WEEK_TARGET_MIN, hubSummaries, MEDITATION_TARGET_MIN, type TrackerData } from '../hub'
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
    // Exercise is a weekly goal: 45 of 150 min this week, logged today.
    expect(s.exercise).toMatchObject({ progress: 45 / EXERCISE_WEEK_TARGET_MIN, logged: true, done: false, value: '45 min', caption: `of ${EXERCISE_WEEK_TARGET_MIN} min this week` })
  })

  it('completes sleep from 7 hours ending this morning', () => {
    const night = (hours: number) => ({
      ...empty,
      sleep: { ok: true as const, data: [{ id: 's', bed_at: at(6, 23), wake_at: at(7, 7), duration_min: hours * 60, quality: 4, awakenings: null, note: null, logged_at: at(7, 7) }] },
    })
    expect(hubSummaries(night(7.5), null, now).sleep).toMatchObject({ logged: true, done: true, value: '7h 30m', caption: 'last night · goal 7h 00m' })
    // Logged but short of the goal: still logged.
    expect(hubSummaries(night(6), null, now).sleep).toMatchObject({ logged: true, done: false })
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

  it('counts the whole week for exercise: rest days still show progress, last week doesn’t count', () => {
    const w = (id: string, day: number, mins: number) => ({ id, activity: 'running' as const, duration_min: mins, intensity: 'moderate' as const, calories_kcal: null, distance_km: null, note: null, logged_at: at(day) })
    // Mon 5 and Tue 6 this week, Sun 4 last week; nothing today (Wed 7).
    const s = hubSummaries({ ...empty, exercise: { ok: true, data: [w('a', 5, 60), w('b', 6, 100), w('c', 4, 90)] } }, null, now).exercise
    expect(s).toMatchObject({ logged: false, done: true, progress: 1, value: '2h 40m' })
  })

  it('uses personal goals', () => {
    const goals = { sleepMin: 8 * 60, meditationMin: 20, exerciseWeekMin: 300 }
    const data: TrackerData = {
      ...empty,
      sleep: { ok: true, data: [{ id: 's', bed_at: at(6, 23), wake_at: at(7, 7), duration_min: 450, quality: 4, awakenings: null, note: null, logged_at: at(7, 7) }] },
      meditation: { ok: true, data: [{ id: 'm', duration_min: 10, session_type: 'breathing', calm_before: null, calm_after: null, note: null, logged_at: at(7) }] },
    }
    const s = hubSummaries(data, null, now, goals)
    expect(s.sleep).toMatchObject({ logged: true, done: false, caption: 'last night · goal 8h 00m' })
    expect(s.meditation).toMatchObject({ logged: true, done: false, progress: 0.5, caption: 'of 20 min today' })
    expect(s.exercise).toMatchObject({ caption: 'of 300 min this week' })
  })
})
