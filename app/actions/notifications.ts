'use server'

import {
  DEFAULT_NOTIFY_TIME,
  SCHEDULE_COLUMNS,
  TRACKER_TYPES,
  isTime,
  isTrackerType,
  toHHMM,
  validateSubscription,
  type ActionResult,
  type NotificationSchedule,
  type TrackerType,
} from '@/lib/notifications'
import { sendPush } from '@/lib/push-server'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'

/*
 * Server actions for reminder notifications. Each checks the session first,
 * then queries as the signed-in user, so row-level security
 * (supabase/notifications.sql) limits everything to their own rows.
 * Sending the notifications is a separate, later piece (a scheduled job).
 */

function friendly(e: { code?: string; message: string }) {
  if (e.code === 'PGRST205' || e.code === 'PGRST202') return 'Reminders aren’t set up yet. Run supabase/notifications.sql in Supabase first.'
  return e.message
}

type Row = { tracker_type: TrackerType; is_enabled: boolean; notify_time: string }

/** All six trackers' reminder settings; trackers never changed come back off, with their default time. */
export async function getNotificationSchedules(): Promise<ActionResult<NotificationSchedule[]>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase.from('notification_schedules').select(SCHEDULE_COLUMNS).returns<Row[]>()
  if (error) return { ok: false, error: friendly(error) }

  const saved = new Map((data ?? []).map((r) => [r.tracker_type, r]))
  return {
    ok: true,
    data: TRACKER_TYPES.map((t) => {
      const r = saved.get(t)
      return r
        ? { tracker_type: t, is_enabled: r.is_enabled, notify_time: toHHMM(r.notify_time), saved: true }
        : { tracker_type: t, is_enabled: false, notify_time: DEFAULT_NOTIFY_TIME[t], saved: false }
    }),
  }
}

/**
 * Turns one tracker's reminder on or off and/or changes its time. Updates the
 * existing row, or inserts it the first time (with the tracker's default time
 * unless one is given).
 */
export async function saveNotificationSchedule(input: {
  tracker_type: TrackerType
  is_enabled?: boolean
  notify_time?: string
}): Promise<ActionResult<NotificationSchedule>> {
  if (!isTrackerType(input?.tracker_type)) return { ok: false, error: 'Unknown tracker.' }
  if (input.is_enabled !== undefined && typeof input.is_enabled !== 'boolean') return { ok: false, error: 'Invalid setting.' }
  if (input.notify_time !== undefined && !isTime(input.notify_time)) return { ok: false, error: 'Choose a valid time.' }
  if (input.is_enabled === undefined && input.notify_time === undefined) return { ok: false, error: 'Nothing to change.' }

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const { supabase, userId } = session

  const patch: Partial<Row> = {}
  if (input.is_enabled !== undefined) patch.is_enabled = input.is_enabled
  if (input.notify_time !== undefined) patch.notify_time = input.notify_time
  const toSchedule = (r: Row): NotificationSchedule => ({ ...r, notify_time: toHHMM(r.notify_time), saved: true })

  // Update first: users may change only is_enabled and notify_time on existing rows.
  {
    const { data, error } = await supabase
      .from('notification_schedules')
      .update(patch)
      .eq('tracker_type', input.tracker_type)
      .select(SCHEDULE_COLUMNS)
      .maybeSingle<Row>()
    if (error) return { ok: false, error: friendly(error) }
    if (data) return { ok: true, data: toSchedule(data) }
  }

  // First change for this tracker: insert it (the database fills in the default time if none was given).
  const { data, error } = await supabase
    .from('notification_schedules')
    .insert({ user_id: userId, tracker_type: input.tracker_type, ...patch })
    .select(SCHEDULE_COLUMNS)
    .single<Row>()
  // 23505: a parallel save inserted it first; apply this change on top.
  if (error?.code === '23505') return saveNotificationSchedule(input)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: toSchedule(data) }
}

/** Saves this browser's push subscription for the signed-in user (moving it from anyone else on a shared device). */
export async function savePushSubscription(subscription: unknown, userAgent?: string): Promise<ActionResult<null>> {
  const parsed = validateSubscription(subscription)
  if (!parsed.ok) return parsed

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { endpoint, keys } = parsed.value
  const { error } = await session.supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 400) : null,
  })
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}

/** Removes this browser's subscription (when the user turns notifications off on this device). */
export async function deletePushSubscription(endpoint: string): Promise<ActionResult<null>> {
  if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint)) return { ok: false, error: 'Invalid subscription.' }
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { error } = await session.supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}

/**
 * Sends a test reminder to every device the signed-in user has turned
 * notifications on for, so they can check it works without waiting.
 * Reads only their own subscriptions (row-level security).
 */
export async function sendTestNotification(): Promise<ActionResult<{ sent: number; devices: number }>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth')
  if (error) return { ok: false, error: friendly(error) }
  const subs = data ?? []
  if (!subs.length) return { ok: false, error: 'Turn on browser notifications for this device first.' }

  const payload = { title: 'OmniWell reminders are on', body: 'This is a test. Your reminders will arrive like this.', icon: '/icons/tracker/water', badge: '/icon/192', url: '/profile#reminders', tag: 'reminder-test' }
  const results = await Promise.all(subs.map((s) => sendPush(s, payload)))
  const gone = subs.filter((_, i) => { const r = results[i]; return !r.ok && r.gone }).map((s) => s.id)
  if (gone.length) await session.supabase.from('push_subscriptions').delete().in('id', gone)
  const sent = results.filter((r) => r.ok).length
  if (!sent) {
    const reason = results.find((r): r is { ok: false; gone: false; error: string } => !r.ok && !r.gone)?.error
    return { ok: false, error: reason ?? 'This device’s notification permission has expired. Turn notifications off and on again.' }
  }
  return { ok: true, data: { sent, devices: subs.length } }
}
