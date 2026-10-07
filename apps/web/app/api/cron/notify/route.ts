import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { reminderPayload, type TrackerType } from '@/lib/notifications'
import { mapLimit, sendPush } from '@/lib/push-server'

/* ------------------------------------------------------------------
 * Reminder delivery, called every 15 minutes by Supabase pg_cron
 * (supabase/notification-cron.sql; Vercel Hobby only allows daily crons).
 *
 *  1. Only the scheduler may call it: it sends
 *     "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET set, it refuses.
 *     (On Vercel Pro, a vercel.json cron would send the same header.)
 *  2. claim_due_notifications() (supabase/notification-delivery.sql) finds
 *     every enabled reminder whose time has come in its user's timezone and
 *     marks it sent in the same step, so overlapping or late runs never
 *     send twice. It returns one row per subscribed device.
 *  3. Each device gets a Web Push; subscriptions the push service reports
 *     gone (404/410) are deleted.
 *
 * Uses the Supabase service role (server only) because it works across all
 * users; the key never leaves the server.
 * ------------------------------------------------------------------ */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Reminders up to this late still go out (covers delayed or skipped cron runs). */
const WINDOW_MINUTES = 60
const CONCURRENCY = 10

type DueRow = { schedule_id: string; user_id: string; tracker_type: TrackerType; subscription_id: string; endpoint: string; p256dh: string; auth: string }

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const now = new Date()
  const { data, error } = await admin.rpc('claim_due_notifications', { p_now: now.toISOString(), p_window_minutes: WINDOW_MINUTES })
  if (error) {
    console.error('[cron/notify] claim failed', error)
    return NextResponse.json({ error: error.code === 'PGRST202' ? 'Run supabase/notification-delivery.sql in Supabase first.' : error.message }, { status: 500 })
  }
  const due = (data ?? []) as DueRow[]

  const results = await mapLimit(due, CONCURRENCY, async (row) => ({ row, result: await sendPush(row, reminderPayload(row.tracker_type)) }))

  const gone = results.filter((r) => !r.result.ok && r.result.gone).map((r) => r.row.subscription_id)
  if (gone.length) {
    const { error: delError } = await admin.from('push_subscriptions').delete().in('id', gone)
    if (delError) console.error('[cron/notify] removing expired subscriptions failed', delError)
  }
  const failed = results.filter((r) => !r.result.ok && !r.result.gone)
  for (const f of failed) console.error('[cron/notify] push failed', f.row.tracker_type, !f.result.ok && !f.result.gone ? f.result.error : '')

  // Counts only: no endpoints or user ids in the response or logs.
  return NextResponse.json({
    at: now.toISOString(),
    devices: due.length,
    sent: results.filter((r) => r.result.ok).length,
    removedExpired: gone.length,
    failed: failed.length,
  })
}
