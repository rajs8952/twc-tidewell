import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sendToPhones, type PhoneMessage } from '@/lib/expo-push'
import { reminderPayload, type PushPayload, type TrackerType } from '@/lib/notifications'
import { mapLimit, sendPush, type SendResult } from '@/lib/push-server'
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
 *  4. Each remaining reminder goes to every one of the person's devices: a
 *     Web Push to each browser, an Expo push to each phone with the OmniWell
 *     app (supabase/mobile-push.sql). Browsers and phones that are gone are deleted.
 *  5. Monday mornings: the weekly recap notification, once a week per person.
 *
 * With supabase/mobile-push.sql run, claim_due_reminders() and
 * claim_weekly_recap_users() also cover people who only use the app; before
 * that, the older browser-only functions are used.
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

type Admin = NonNullable<ReturnType<typeof supabaseAdmin>>
type WebSub = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }
type Phone = { token: string; user_id: string }

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = supabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 500 })

  const now = new Date()

  // ---- Reminders ----
  // claim_due_reminders(): one row per due reminder (phones included). Before mobile-push.sql: the browser-only version.
  let claimed: { user_id: string; tracker_type: TrackerType }[]
  let webSubs: WebSub[] | null = null
  const fresh = await admin.rpc('claim_due_reminders', { p_now: now.toISOString(), p_window_minutes: WINDOW_MINUTES })
  if (!fresh.error) {
    claimed = (fresh.data ?? []) as { user_id: string; tracker_type: TrackerType }[]
  } else if (fresh.error.code === 'PGRST202') {
    const { data, error } = await admin.rpc('claim_due_notifications', { p_now: now.toISOString(), p_window_minutes: WINDOW_MINUTES })
    if (error) {
      console.error('[cron/notify] claim failed', error)
      return NextResponse.json({ error: error.code === 'PGRST202' ? 'Run supabase/notification-delivery.sql in Supabase first.' : error.message }, { status: 500 })
    }
    const rows = (data ?? []) as DueRow[]
    claimed = rows
    webSubs = rows.map((r) => ({ id: r.subscription_id, user_id: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }))
  } else {
    console.error('[cron/notify] claim failed', fresh.error)
    return NextResponse.json({ error: fresh.error.message }, { status: 500 })
  }
  const done = await remindersAlreadyDone(admin, claimed, now)
  // Reminders are Premium: free accounts' reminders are claimed (so they don't pile up) but not sent.
  const premium = await premiumUsers(admin, claimed.map((r) => r.user_id))
  const due = uniqueBy(
    claimed.filter((r) => premium(r.user_id) && !done.has(`${r.user_id}:${r.tracker_type}`)),
    (r) => `${r.user_id}:${r.tracker_type}`,
  )

  // ---- Weekly recap: "Your week in OmniWell" ----
  let recapUsers: string[] = []
  const recapFresh = await admin.rpc('claim_weekly_recap_users', { p_now: now.toISOString() })
  if (!recapFresh.error) {
    recapUsers = ((recapFresh.data ?? []) as { user_id: string }[]).map((r) => r.user_id)
  } else if (recapFresh.error.code === 'PGRST202') {
    const old = await admin.rpc('claim_weekly_recaps', { p_now: now.toISOString() })
    if (old.error && old.error.code !== 'PGRST202') console.error('[cron/notify] weekly recap claim failed', old.error)
    const rows = (old.data ?? []) as { user_id: string; subscription_id: string; endpoint: string; p256dh: string; auth: string }[]
    recapUsers = [...new Set(rows.map((r) => r.user_id))]
    webSubs = [...(webSubs ?? []), ...rows.map((r) => ({ id: r.subscription_id, user_id: r.user_id, endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }))]
  } else {
    console.error('[cron/notify] weekly recap claim failed', recapFresh.error)
  }
  const recapPremium = await premiumUsers(admin, recapUsers)
  recapUsers = recapUsers.filter((id) => recapPremium(id))
  const recapPayload: PushPayload = { title: 'Your week in OmniWell', body: 'See how last week went, and what to aim for this week.', icon: '/icon/192', badge: '/icon/192', url: '/dashboard#week', tag: 'weekly-recap' }

  // ---- Everyone's devices ----
  const people = [...new Set([...due.map((r) => r.user_id), ...recapUsers])]
  const browsers = webSubs ? webSubs : await loadWebSubs(admin, people)
  const phones = await loadPhones(admin, people)

  const sends: { sub: WebSub; payload: PushPayload }[] = []
  const phoneMessages: PhoneMessage[] = []
  const toPhones = (userId: string, p: PushPayload) => {
    for (const ph of phones) if (ph.user_id === userId) phoneMessages.push({ token: ph.token, title: p.title, body: p.body, url: p.url, channelId: 'reminders' })
  }
  for (const r of due) {
    const payload = reminderPayload(r.tracker_type)
    for (const sub of uniqueBy(browsers.filter((b) => b.user_id === r.user_id), (b) => b.id)) sends.push({ sub, payload })
    toPhones(r.user_id, payload)
  }
  for (const id of recapUsers) {
    for (const sub of uniqueBy(browsers.filter((b) => b.user_id === id), (b) => b.id)) sends.push({ sub, payload: recapPayload })
    toPhones(id, recapPayload)
  }

  const results: { sub: WebSub; result: SendResult }[] = await mapLimit(sends, CONCURRENCY, async (s) => ({ sub: s.sub, result: await sendPush(s.sub, s.payload) }))
  const phoneResult = await sendToPhones(phoneMessages)

  const gone = [...new Set(results.filter((r) => !r.result.ok && r.result.gone).map((r) => r.sub.id))]
  if (gone.length) {
    const { error: delError } = await admin.from('push_subscriptions').delete().in('id', gone)
    if (delError) console.error('[cron/notify] removing expired subscriptions failed', delError)
  }
  if (phoneResult.gone.length) {
    const { error: delError } = await admin.from('mobile_push_tokens').delete().in('token', phoneResult.gone)
    if (delError) console.error('[cron/notify] removing expired phones failed', delError)
  }
  const failed = results.filter((r) => !r.result.ok && !r.result.gone)
  for (const f of failed) console.error('[cron/notify] push failed', !f.result.ok && !f.result.gone ? f.result.error : '')

  // Counts only: no endpoints, tokens or user ids in the response or logs.
  return NextResponse.json({
    at: now.toISOString(),
    reminders: due.length,
    skippedAlreadyDone: claimed.length - due.length,
    weeklyRecaps: recapUsers.length,
    sent: results.filter((r) => r.result.ok).length,
    sentToPhones: phoneResult.sent,
    removedExpired: gone.length + phoneResult.gone.length,
    failed: failed.length + phoneResult.failed,
  })
}

function uniqueBy<T>(items: T[], key: (t: T) => string) {
  const seen = new Set<string>()
  return items.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)))
}

/** The people's browser subscriptions. */
async function loadWebSubs(admin: Admin, ids: string[]): Promise<WebSub[]> {
  if (!ids.length) return []
  const { data, error } = await admin.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', ids)
  if (error) console.error('[cron/notify] loading browsers failed', error)
  return (data ?? []) as WebSub[]
}

/** The people's phones with the OmniWell app (none before mobile-push.sql). */
async function loadPhones(admin: Admin, ids: string[]): Promise<Phone[]> {
  if (!ids.length) return []
  const { data, error } = await admin.from('mobile_push_tokens').select('token, user_id').in('user_id', ids)
  if (error && error.code !== 'PGRST205' && error.code !== '42P01') console.error('[cron/notify] loading phones failed', error)
  return (data ?? []) as Phone[]
}

/** Who has Premium (has_premium() in supabase/subscriptions.sql); everyone, before that SQL is run. */
async function premiumUsers(admin: Admin, ids: string[]) {
  const unique = [...new Set(ids)]
  const yes = new Set<string>()
  for (const id of unique) {
    const { data, error } = await admin.rpc('has_premium', { p_user: id })
    if (error?.code === 'PGRST202') return () => true
    if (data === true) yes.add(id)
  }
  return (id: string) => yes.has(id)
}
