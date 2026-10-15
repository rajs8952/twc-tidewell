import { supabase } from './supabase'
import type { TrackerId } from './trackers'

/** One tracker's reminder, as stored in notification_schedules (supabase/notifications.sql). */
export interface ScheduleRow {
  is_enabled: boolean
  notify_time: string
  repeat_every_minutes: number | null
  end_time: string | null
}

/**
 * Saves one tracker's reminder as the website's saveNotificationSchedule does:
 * update the existing row, or insert it the first time. Row-level security
 * keeps it to the signed-in person's own reminders.
 */
export async function saveSchedule(tracker: TrackerId, row: ScheduleRow) {
  const values = { ...row, end_time: row.repeat_every_minutes ? row.end_time : null }
  const upd = await supabase.from('notification_schedules').update(values).eq('tracker_type', tracker).select('tracker_type').maybeSingle()
  if (upd.error) throw upd.error
  if (upd.data) return
  const { data: auth } = await supabase.auth.getUser()
  const ins = await supabase.from('notification_schedules').insert({ user_id: auth.user?.id, tracker_type: tracker, ...values })
  // 23505: saved meanwhile (e.g. twice quickly): apply this on top.
  if (ins.error?.code === '23505') return saveSchedule(tracker, row)
  if (ins.error) throw ins.error
}
