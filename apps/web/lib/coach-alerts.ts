import 'server-only'
import { layout, sendEmail } from './email'
import { TEAMS, type Team } from './messages'
import { supabaseAdmin } from './supabase/admin'

/*
 * Coach alerts: when a query reaches a coach (routed straight to them, or
 * new in their team's pool), they get an in-app notification
 * (supabase/coach-alerts.sql) and an email (lib/email.ts: Gmail/SMTP via
 * Nodemailer, or Resend).
 *
 * Called from the routing server actions after the query is saved, in the
 * background (waitUntil), so the employee never waits on email delivery and
 * a failed email never fails their message.
 *
 * Privacy: alerts never include the employee's name or what they wrote,
 * only that a query is waiting, with a link to log in.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY on the server; email settings are in
 * lib/email.ts. Without them, in-app alerts still work and emails are skipped.
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

/**
 * Emails one coach that a query is waiting for them. Resolves to whether it
 * was sent; never throws.
 */
export async function sendCoachAlertEmail(coachEmail: string, userType: Team, threadId: string, kind: AlertKind = 'assigned', origin = 'https://omniwell-app.vercel.app'): Promise<boolean> {
  const team = TEAMS[userType].label.toLowerCase()
  const { html, text } = layout({
    heading: kind === 'assigned' ? 'A query is waiting for you' : `New query in the ${team} pool`,
    paragraphs: [alertText(kind, userType)],
    button: { label: `Open the ${team} portal`, url: portalLink(origin, userType, threadId) },
    footer: `You're getting this because you're on the OmniWell ${team} team.`,
  })
  try {
    await sendEmail({ to: coachEmail, subject: kind === 'assigned' ? 'New query in your OmniWell queue' : `New ${team} query in the OmniWell pool`, text, html })
    return true
  } catch (e) {
    console.error('[coach-alerts]', (e as Error).message)
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
