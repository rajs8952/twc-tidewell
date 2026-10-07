/* ------------------------------------------------------------------
 * Reminder notifications: shared types, defaults and validation.
 * Imported by both the server actions (app/actions/notifications.ts) and
 * the settings UI, so it must stay free of server-only or browser-only code.
 * Tables and row-level security: supabase/notifications.sql.
 * ------------------------------------------------------------------ */

import type { TrackerId } from './trackers'

export type { ActionResult } from '@omniwell/core/types'

/** Mirrors the tracker_type enum in supabase/notifications.sql. */
export type TrackerType = TrackerId

export const TRACKER_TYPES: TrackerType[] = ['water', 'mood', 'meditation', 'sleep', 'weight', 'exercise']

/** Each tracker's starting reminder time; mirrors default_notify_time() in the SQL. */
export const DEFAULT_NOTIFY_TIME: Record<TrackerType, string> = {
  water: '09:00',
  weight: '07:30',
  meditation: '07:00',
  mood: '18:00',
  exercise: '17:30',
  sleep: '20:00',
}

/** What each reminder will say; shown under the tracker in the settings list. */
export const REMINDER_HINT: Record<TrackerType, string> = {
  water: 'A nudge to keep drinking through the day',
  weight: 'A morning weigh-in reminder',
  meditation: 'A few calm minutes to start the day',
  mood: 'An evening check-in on how you feel',
  exercise: 'Time to move, if you haven’t yet',
  sleep: 'Wind down and log last night’s sleep',
}

export interface NotificationSchedule {
  tracker_type: TrackerType
  is_enabled: boolean
  /** Local time, "HH:MM". */
  notify_time: string
  /** False when the user has never changed this tracker (shown as off, with the default time). */
  saved: boolean
}

export const SCHEDULE_COLUMNS = 'tracker_type, is_enabled, notify_time'

export const isTrackerType = (v: unknown): v is TrackerType => typeof v === 'string' && (TRACKER_TYPES as string[]).includes(v)

/** "HH:MM" or "HH:MM:SS", 00:00–23:59. */
export const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v)

/** Postgres returns "HH:MM:SS"; the time picker uses "HH:MM". */
export const toHHMM = (t: string) => t.slice(0, 5)

/** The browser's push subscription as PushSubscription.toJSON() returns it. */
export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export function validateSubscription(v: unknown): { ok: true; value: PushSubscriptionInput } | { ok: false; error: string } {
  const s = v as Partial<PushSubscriptionInput> | null
  const bad = { ok: false as const, error: 'This browser returned an invalid notification subscription.' }
  if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 2048) return bad
  const k = s.keys
  if (!k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return bad
  if (k.p256dh.length < 20 || k.p256dh.length > 200 || k.auth.length < 8 || k.auth.length > 100) return bad
  return { ok: true, value: { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } } }
}

/**
 * What each reminder says when it arrives. Kept general on purpose:
 * notifications can show on a lock screen, so no personal health details.
 */
export const REMINDER_MESSAGE: Record<TrackerType, { title: string; body: string; url: string }> = {
  water: { title: 'Time to log your water!', body: 'A glass now keeps you on track for today’s goal.', url: '/water' },
  weight: { title: 'Morning weigh-in', body: 'Log your weight to keep your trend up to date.', url: '/weight' },
  meditation: { title: 'A few calm minutes?', body: 'Start the day with a short breathing session.', url: '/meditation' },
  mood: { title: 'How are you feeling?', body: 'Take ten seconds to check in on your mood.', url: '/mood' },
  exercise: { title: 'Time to move', body: 'Even a short walk counts. Log it when you’re done.', url: '/exercise' },
  sleep: { title: 'How did you sleep last night?', body: 'Log your sleep, then start winding down for tonight.', url: '/sleep' },
}

/** The JSON a reminder push carries; read by the service worker (app/sw.ts). */
export interface PushPayload {
  title: string
  body: string
  icon: string
  badge?: string
  /** Where tapping the notification opens; always a path within the app. */
  url: string
  /** Replaces an earlier, unread notification with the same tag. */
  tag: string
}

export function reminderPayload(tracker: TrackerType): PushPayload {
  const m = REMINDER_MESSAGE[tracker]
  return { title: m.title, body: m.body, icon: `/icons/tracker/${tracker}`, badge: '/icon/192', url: m.url, tag: `reminder-${tracker}` }
}
