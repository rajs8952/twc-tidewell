import { waitUntil } from '@vercel/functions'
import { NextResponse } from 'next/server'
import { alertCoachOfReply, alertCoachesOfQuery } from '@/lib/coach-alerts'
import { isTeam } from '@/lib/messages'
import { isJson, signedInFromBearer } from '@/lib/supabase/bearer'
import { supabaseAdmin } from '@/lib/supabase/admin'

/* ------------------------------------------------------------------
 * POST /api/mobile/chat-alert: the OmniWell app's message just went in,
 * so alert the coach(es), as the website's own sends do
 * (submitUserQuery / notifyCoachOfReply in app/actions/routing.ts):
 *   { threadId, kind: 'new' }    a new conversation: its coach, or the team's pool
 *   { threadId, kind: 'reply' }  a follow-up: the conversation's coach
 * Signed-in employees only (the app's access token), for their own
 * conversations. 'new' only for a conversation opened in the last 10
 * minutes that hasn't been announced yet; 'reply' is limited to once per
 * conversation every 30 minutes by alertCoachOfReply itself.
 * ------------------------------------------------------------------ */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ORIGIN = 'https://omniwell-app.vercel.app'
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)

export async function POST(req: Request) {
  if (!isJson(req)) return NextResponse.json({ error: 'Send JSON.' }, { status: 415 })
  const session = await signedInFromBearer(req)
  if (!session) return NextResponse.json({ error: 'Signed out.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { threadId?: unknown; kind?: unknown } | null
  if (!body || !isUuid(body.threadId) || (body.kind !== 'new' && body.kind !== 'reply')) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })

  // Read as the employee: row-level security only returns their own conversations.
  const { data: thread } = await session.supabase
    .from('therapist_threads')
    .select('id, team, status, assigned_coach_id, user_id, created_at')
    .eq('id', body.threadId)
    .maybeSingle<{ id: string; team: string; status: string; assigned_coach_id: string | null; user_id: string; created_at: string }>()
  if (!thread || thread.user_id !== session.userId || !isTeam(thread.team)) return NextResponse.json({ ok: true })
  const team = thread.team

  if (body.kind === 'new') {
    if (Date.now() - Date.parse(thread.created_at) > 10 * 60_000) return NextResponse.json({ ok: true })
    const admin = supabaseAdmin()
    const { data: already } = admin ? await admin.from('in_app_notifications').select('id').eq('thread_id', thread.id).limit(1) : { data: [] }
    if (already?.length) return NextResponse.json({ ok: true })
    waitUntil(alertCoachesOfQuery({ threadId: thread.id, team, origin: ORIGIN }))
  } else {
    if (thread.status !== 'in_progress' || !thread.assigned_coach_id) return NextResponse.json({ ok: true })
    waitUntil(alertCoachOfReply({ threadId: thread.id, team, coachId: thread.assigned_coach_id, origin: ORIGIN }))
  }
  return NextResponse.json({ ok: true })
}
