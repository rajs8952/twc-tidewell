import 'server-only'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { TEAMS, type Team } from './messages'
import { supabaseAdmin } from './supabase/admin'

/*
 * Coach alerts: when a query reaches a coach (routed straight to them, or
 * new in their team's pool), they get an in-app notification
 * (supabase/coach-alerts.sql) and an email: through any SMTP server
 * (Gmail, Microsoft 365…) via Nodemailer when SMTP_* is set, otherwise
 * through Resend.
 *
 * Called from the routing server actions after the query is saved, in the
 * background (waitUntil), so the employee never waits on email delivery and
 * a failed email never fails their message.
 *
 * Privacy: alerts never include the employee's name or what they wrote,
 * only that a query is waiting, with a link to log in.
 *
 * Needs on the server (Vercel env vars): SUPABASE_SERVICE_ROLE_KEY, and for
 * email one of:
 *   SMTP  SMTP_HOST, SMTP_PORT (465 or 587), SMTP_USER, SMTP_PASS, optional
 *         SMTP_FROM. For Gmail: smtp.gmail.com, 465, the Gmail address, and
 *         a Google "app password" (not the account password). Gmail sends
 *         from the signed-in address whatever SMTP_FROM says.
 *   Resend  RESEND_API_KEY and RESEND_FROM (on a domain verified in Resend).
 * With neither, in-app alerts still work and emails are skipped.
 */

export type AlertKind = 'assigned' | 'pool'

function portalLink(origin: string, team: Team, threadId: string) {
  return `${origin}${TEAMS[team].portalPath}?thread=${encodeURIComponent(threadId)}`
}

function alertText(kind: AlertKind, team: Team) {
  return kind === 'assigned'
    ? 'A new user query has been assigned to your queue. Log in to view it.'
    : `A new user query is waiting in the ${TEAMS[team].label.toLowerCase()} pool. Log in to view it.`
}

interface Email {
  to: string
  subject: string
  text: string
  html: string
}

/** SMTP (Nodemailer) when configured, else Resend, else nothing. */
function mailer(): { name: string; send: (m: Email) => Promise<void> } | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, RESEND_API_KEY, RESEND_FROM } = process.env
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 465
    // One short-lived connection per alert batch: serverless functions don't keep sockets between requests.
    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS from the start; 587 upgrades with STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
    const from = SMTP_FROM || `OmniWell <${SMTP_USER}>`
    return { name: 'smtp', send: async (m) => void (await transport.sendMail({ from, ...m })) }
  }
  if (RESEND_API_KEY && RESEND_FROM) {
    const client = new Resend(RESEND_API_KEY)
    return {
      name: 'resend',
      send: async (m) => {
        const { error } = await client.emails.send({ from: RESEND_FROM, ...m })
        if (error) throw new Error(`${error.name}: ${error.message}`)
      },
    }
  }
  return null
}

/**
 * Emails one coach that a query is waiting for them. Resolves to whether it
 * was sent; never throws.
 */
export async function sendCoachAlertEmail(coachEmail: string, userType: Team, threadId: string, kind: AlertKind = 'assigned', origin = 'https://omniwell-app.vercel.app'): Promise<boolean> {
  const transport = mailer()
  if (!transport) {
    console.warn('[coach-alerts] email skipped: set SMTP_HOST/SMTP_USER/SMTP_PASS (e.g. Gmail) or RESEND_API_KEY/RESEND_FROM')
    return false
  }
  const text = alertText(kind, userType)
  const link = portalLink(origin, userType, threadId)
  try {
    await transport.send({
      to: coachEmail,
      subject: kind === 'assigned' ? 'New query in your OmniWell queue' : `New ${TEAMS[userType].label.toLowerCase()} query in the OmniWell pool`,
      text: `${text}\n\n${link}\n\nYou're getting this because you're on the OmniWell ${TEAMS[userType].label.toLowerCase()} team.`,
      html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#17303a">
  <p>${text}</p>
  <p><a href="${link}" style="display:inline-block;background:#0f7a6a;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:999px">Open the ${TEAMS[userType].label.toLowerCase()} portal</a></p>
  <p style="color:#5b6b73;font-size:12px">You're getting this because you're on the OmniWell ${TEAMS[userType].label.toLowerCase()} team.</p>
</div>`,
    })
    return true
  } catch (e) {
    // The message only: SMTP errors never include the password, but keep logs lean anyway.
    console.error(`[coach-alerts] email via ${transport.name} failed:`, (e as Error).message)
    return false
  }
}

/**
 * Alerts whoever should hear about a newly submitted query:
 *   routed to a coach → that coach
 *   in the pool       → every coach on that team who is accepting new and has room
 * Never throws (it runs after the response has been sent).
 */
export async function alertCoachesOfQuery({ threadId, team, origin }: { threadId: string; team: Team; origin: string }) {
  const admin = supabaseAdmin()
  if (!admin) {
    console.warn('[coach-alerts] skipped: SUPABASE_SERVICE_ROLE_KEY not set')
    return
  }
  try {
    const { data: thread } = await admin.from('therapist_threads').select('status, assigned_coach_id').eq('id', threadId).maybeSingle<{ status: string; assigned_coach_id: string | null }>()
    if (!thread) return

    let kind: AlertKind
    let coachIds: string[]
    if (thread.status === 'in_progress' && thread.assigned_coach_id) {
      kind = 'assigned'
      coachIds = [thread.assigned_coach_id]
    } else if (thread.status === 'unassigned') {
      kind = 'pool'
      const { data: coaches } = await admin.from('coach_profiles').select('user_id, current_load, max_capacity').eq('category', team).eq('is_accepting_new', true)
      coachIds = ((coaches ?? []) as { user_id: string; current_load: number; max_capacity: number }[]).filter((c) => c.current_load < c.max_capacity).map((c) => c.user_id)
    } else {
      return
    }
    if (!coachIds.length) return

    const message = alertText(kind, team).replace(' Log in to view it.', '')
    const { error } = await admin.from('in_app_notifications').insert(coachIds.map((user_id) => ({ user_id, message, thread_id: threadId })))
    if (error) console.error('[coach-alerts] in-app insert failed:', error.code, error.message)

    // Emails: active (not deactivated) coaches only.
    await Promise.all(
      coachIds.map(async (id) => {
        const { data } = await admin.auth.admin.getUserById(id)
        const user = data?.user
        const banned = !!user?.banned_until && Date.parse(user.banned_until) > Date.now()
        if (user?.email && !banned) await sendCoachAlertEmail(user.email, team, threadId, kind, origin)
      }),
    )
  } catch (e) {
    console.error('[coach-alerts] failed:', (e as Error).message)
  }
}

/** Once a pool query is claimed, every alert about it is marked read: it's no longer up for grabs. */
export async function clearPoolAlerts(threadId: string) {
  const admin = supabaseAdmin()
  if (!admin) return
  const { error } = await admin.from('in_app_notifications').update({ is_read: true }).eq('thread_id', threadId).eq('is_read', false)
  if (error && error.code !== 'PGRST205') console.error('[coach-alerts] clearing pool alerts failed:', error.code, error.message)
}
