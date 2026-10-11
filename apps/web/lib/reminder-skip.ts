import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { effectiveGoal, type Activity, type Gender } from '@rajs8952/core/hydration'
import { goalsOf } from '@rajs8952/core/goals'
import { WEIGH_IN_EVERY_DAYS } from '@rajs8952/trackers/hub'
import type { TrackerType } from './notifications'

/*
 * Which due reminders have nothing left to remind about, so the cron route
 * skips them: the tracker is already done today, in the user's own timezone,
 * using the same "done" rules as the Home rings (@rajs8952/trackers/hub):
 *   water       today's (effective) total has reached the goal
 *   mood        any check-in today
 *   sleep       last night is logged (a sleep that ended today)
 *   meditation  their daily meditation goal reached
 *   exercise    a workout today, or their weekly exercise goal already met
 *   weight      a weigh-in in the last 7 days (so daily reminders act weekly)
 * Skipped reminders still count as sent for that time slot.
 */

type Pair = { user_id: string; tracker_type: TrackerType }
type Profile = {
  id: string
  timezone: string | null
  weight_kg: number
  gender: Gender
  activity_level: Activity
  custom_goal_ml: number | null
  goal_meditation_min?: number
  goal_exercise_week_min?: number
}

/** The UTC instant of local midnight today in `timeZone` (falls back to UTC if unknown). */
export function startOfLocalDay(now: Date, timeZone: string | null): Date {
  let tz = timeZone || 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  // How far the zone is ahead of UTC right now, then midnight of its date in UTC terms.
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!)
  const offsetMs = asUtc - Math.floor(now.getTime() / 1000) * 1000
  return new Date(Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!) - offsetMs)
}

/** The UTC instant of Monday 00:00 this week in `timeZone` (weeks run Monday–Sunday, like the trackers). */
export function startOfLocalWeek(now: Date, timeZone: string | null): Date {
  let tz = timeZone || 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
  } catch {
    tz = 'UTC'
  }
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now)
  const sinceMonday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(weekday)
  return new Date(startOfLocalDay(now, tz).getTime() - Math.max(0, sinceMonday) * 86_400_000)
}

/** Keys ("user:tracker") of reminders to skip. Never throws: on any error, nothing is skipped. */
export async function remindersAlreadyDone(admin: SupabaseClient, pairs: Pair[], now: Date): Promise<Set<string>> {
  const skip = new Set<string>()
  if (!pairs.length) return skip
  try {
    const users = [...new Set(pairs.map((p) => p.user_id))]
    const wanted = (t: TrackerType) => [...new Set(pairs.filter((p) => p.tracker_type === t).map((p) => p.user_id))]

    // select('*') so this keeps working before supabase/personal-goals.sql adds the goal columns.
    const { data: profiles } = await admin.from('profiles').select('*').in('id', users)
    const byId = new Map(((profiles ?? []) as Profile[]).map((p) => [p.id, p]))
    const dayStart = (u: string) => startOfLocalDay(now, byId.get(u)?.timezone ?? null)
    // Enough history for every timezone's "today"; exercise needs the whole week.
    const since = new Date(now.getTime() - 26 * 3600_000).toISOString()
    const weekAgo = new Date(now.getTime() - 8 * 86400_000).toISOString()

    const sumToday = (rows: { user_id: string; at: string; n: number }[], u: string) => {
      const start = dayStart(u).getTime()
      return rows.filter((r) => r.user_id === u && Date.parse(r.at) >= start).reduce((s, r) => s + r.n, 0)
    }
    const load = async (table: string, cols: string, ids: string[], from = since, timeCol = 'logged_at') => {
      if (!ids.length) return []
      const { data } = await admin.from(table).select(`user_id, ${cols}`).in('user_id', ids).gte(timeCol, from)
      return (data ?? []) as unknown as Record<string, unknown>[]
    }

    const [water, mood, sleep, meditation, exercise, weight] = await Promise.all([
      load('drink_logs', 'logged_at, effective_ml', wanted('water')),
      load('mood_logs', 'logged_at', wanted('mood')),
      load('sleep_logs', 'wake_at', wanted('sleep'), since, 'wake_at'),
      load('meditation_logs', 'logged_at, duration_min', wanted('meditation')),
      load('exercise_logs', 'logged_at, duration_min', wanted('exercise'), weekAgo),
      load('weight_logs', 'logged_at', wanted('weight'), new Date(now.getTime() - WEIGH_IN_EVERY_DAYS * 86400_000).toISOString()),
    ])

    for (const u of wanted('water')) {
      const p = byId.get(u)
      if (!p) continue
      const total = sumToday(water.map((r) => ({ user_id: r.user_id as string, at: r.logged_at as string, n: Number(r.effective_ml) || 0 })), u)
      if (total >= effectiveGoal(p)) skip.add(`${u}:water`)
    }
    for (const u of wanted('mood')) if (sumToday(mood.map((r) => ({ user_id: r.user_id as string, at: r.logged_at as string, n: 1 })), u) > 0) skip.add(`${u}:mood`)
    for (const u of wanted('sleep')) if (sumToday(sleep.map((r) => ({ user_id: r.user_id as string, at: r.wake_at as string, n: 1 })), u) > 0) skip.add(`${u}:sleep`)
    for (const u of wanted('meditation'))
      if (sumToday(meditation.map((r) => ({ user_id: r.user_id as string, at: r.logged_at as string, n: Number(r.duration_min) || 0 })), u) >= goalsOf(byId.get(u)).meditationMin) skip.add(`${u}:meditation`)
    for (const u of wanted('exercise')) {
      const rows = exercise.map((r) => ({ user_id: r.user_id as string, at: r.logged_at as string, n: Number(r.duration_min) || 0 }))
      const weekStart = startOfLocalWeek(now, byId.get(u)?.timezone ?? null).getTime()
      const todayDone = sumToday(rows, u) > 0
      const weekMins = rows.filter((r) => r.user_id === u && Date.parse(r.at) >= weekStart).reduce((s, r) => s + r.n, 0)
      if (todayDone || weekMins >= goalsOf(byId.get(u)).exerciseWeekMin) skip.add(`${u}:exercise`)
    }
    for (const u of wanted('weight')) if (weight.some((r) => r.user_id === u)) skip.add(`${u}:weight`)
  } catch (e) {
    console.error('[cron/notify] done-today check failed; sending everything', (e as Error).message)
    return new Set()
  }
  return skip
}
