import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { reminderPayload, type TrackerType } from '@/lib/notifications'
import { mapLimit, sendPush } from '@/lib/push-server'
import { remindersAlreadyDone } from '@/lib/reminder-skip'
import { supabaseAdmin } from '@/lib/supabase/admin'

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
 *  3. Reminders for something already done today (water goal met, mood
 *     logged, weighed in this week…) are skipped: lib/reminder-skip.ts.
 *  4. Each remaining device gets a Web Push; subscriptions the push service
 *     reports gone (404/410) are deleted.
 *  5. Monday mornings: the weekly recap notification (claim_weekly_recaps(),
 *     supabase/weekly-recap.sql), once a week per person.
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

  const admin = supabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 })

  const now = new Date()
  const { data, error } = await admin.rpc('claim_due_notifications', { p_now: now.toISOString(), p_window_minutes: WINDOW_MINUTES })
  if (error) {
    console.error('[cron/notify] claim failed', error)
    return NextResponse.json({ error: error.code === 'PGRST202' ? 'Run supabase/notification-delivery.sql in Supabase first.' : error.message }, { status: 500 })
  }
  const claimed = (data ?? []) as DueRow[]
  const done = await remindersAlreadyDone(admin, claimed, now)
  // Reminders are Premium: free accounts' reminders are claimed (so they don't pile up) but not sent.
  const premium = await premiumUsers(admin, claimed.map((r) => r.user_id))
  const due = claimed.filter((r) => premium(r.user_id) && !done.has(`${r.user_id}:${r.tracker_type}`))

  const results = await mapLimit(due, CONCURRENCY, async (row) => ({ row, result: await sendPush(row, reminderPayload(row.tracker_type)) }))

  // Weekly recap: "Your week in OmniWell is ready". Optional until weekly-recap.sql has run.
  const recaps = await admin.rpc('claim_weekly_recaps', { p_now: now.toISOString() })
  if (recaps.error && recaps.error.code !== 'PGRST202') console.error('[cron/notify] weekly recap claim failed', recaps.error)
  const recapClaimed = (recaps.data ?? []) as { user_id: string; subscription_id: string; endpoint: string; p256dh: string; auth: string }[]
  const recapPremium = await premiumUsers(admin, recapClaimed.map((r) => r.user_id))
  const recapRows = recapClaimed.filter((r) => recapPremium(r.user_id))
  const recapPayload = { title: 'Your week in OmniWell', body: 'See how last week went, and what to aim for this week.', icon: '/icon/192', badge: '/icon/192', url: '/dashboard#week', tag: 'weekly-recap' }
  const recapResults = await mapLimit(recapRows, CONCURRENCY, async (row) => ({ row, result: await sendPush(row, recapPayload) }))
  for (const r of recapResults) results.push({ row: { ...r.row, schedule_id: '', tracker_type: 'mood' }, result: r.result })

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
    skippedAlreadyDone: claimed.length - due.length,
    weeklyRecaps: recapRows.length,
    sent: results.filter((r) => r.result.ok).length,
    removedExpired: gone.length,
    failed: failed.length,
  })
}

/** Who has Premium (has_premium() in supabase/subscriptions.sql); everyone, before that SQL is run. */
async function premiumUsers(admin: NonNullable<ReturnType<typeof supabaseAdmin>>, ids: string[]) {
  const unique = [...new Set(ids)]
  const yes = new Set<string>()
  for (const id of unique) {
    const { data, error } = await admin.rpc('has_premium', { p_user: id })
    if (error?.code === 'PGRST202') return () => true
    if (data === true) yes.add(id)
  }
  return (id: string) => yes.has(id)
}
