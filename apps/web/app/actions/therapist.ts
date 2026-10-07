'use server'

import {
  MAX_THREAD_MESSAGES,
  STAFF_MESSAGE_COLUMNS,
  isTeam,
  validateMessage,
  type ActionResult,
  type Team,
  type QueueItem,
  type StaffThreadMessage,
  type ThreadStatus,
} from '@/lib/messages'
import { SIGNED_OUT, isUuid, signedIn } from '@/lib/supabase/actions'

/*
 * Server actions for the wellness-team portals (therapists and dietitians).
 * Each checks the session and that the caller is staff (public.therapists)
 * before doing anything; the database's staff policies
 * (supabase/therapist-portal.sql) enforce the same rules again on every
 * query, including that staff only ever see their own team's conversations.
 */

const NOT_THERAPIST = 'This area is for the wellness team only.'
const NOT_FOUND = 'That conversation wasn’t found.'

function friendly(e: { code?: string; message: string }) {
  if (e.code === 'PGRST202' || e.code === 'PGRST205') return 'The therapist portal isn’t set up yet. Run supabase/therapist-portal.sql in Supabase first.'
  if (e.code === '42501') return NOT_THERAPIST
  return e.message
}

/** The signed-in therapist's session and id, or an error to return. */
type TherapistSession =
  | { session: NonNullable<Awaited<ReturnType<typeof signedIn>>>; team: Team; error?: undefined }
  | { session?: undefined; team?: undefined; error: string }

async function therapistSession(): Promise<TherapistSession> {
  const session = await signedIn()
  if (!session) return { error: SIGNED_OUT }
  const { data, error } = await session.supabase.rpc('staff_team')
  if (error) return { error: friendly(error) }
  if (!isTeam(data)) return { error: NOT_THERAPIST }
  return { session, team: data }
}

/** The caller's wellness team, or null for employees; used by the portal layouts to gate each page. */
export async function myStaffTeam(): Promise<Team | null> {
  return (await therapistSession()).team ?? null
}

/** Every conversation for the caller's team, open and waiting first (longest wait at the top). */
export async function getQueue(): Promise<ActionResult<QueueItem[]>> {
  const t = await therapistSession()
  if (t.error !== undefined) return { ok: false, error: t.error }

  const { data, error } = await t.session.supabase.rpc('therapist_queue')
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: (data ?? []) as QueueItem[] }
}

/** One conversation: who it's from, its status, and its latest messages in reading order. */
export async function getConversation(
  threadId: string,
): Promise<ActionResult<{ item: QueueItem; messages: StaffThreadMessage[]; me: string; team: Team }>> {
  if (!isUuid(threadId)) return { ok: false, error: NOT_FOUND }
  const t = await therapistSession()
  if (t.error !== undefined) return { ok: false, error: t.error }
  const { supabase, userId } = t.session

  const [queue, msgs] = await Promise.all([
    supabase.rpc('therapist_queue', { p_thread_id: threadId }),
    supabase
      .from('thread_messages')
      .select(STAFF_MESSAGE_COLUMNS)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_THREAD_MESSAGES)
      .returns<StaffThreadMessage[]>(),
  ])
  if (queue.error) return { ok: false, error: friendly(queue.error) }
  const item = (queue.data as QueueItem[] | null)?.[0]
  if (!item) return { ok: false, error: NOT_FOUND }
  if (msgs.error) return { ok: false, error: friendly(msgs.error) }
  return { ok: true, data: { item, messages: (msgs.data ?? []).reverse(), me: userId, team: t.team } }
}

/** Replies to an open conversation in the caller's team. */
export async function replyToThread(threadId: string, content: string): Promise<ActionResult<StaffThreadMessage>> {
  const parsed = validateMessage(content)
  if (!parsed.ok) return parsed
  if (!isUuid(threadId)) return { ok: false, error: NOT_FOUND }
  const t = await therapistSession()
  if (t.error !== undefined) return { ok: false, error: t.error }

  const { data, error } = await t.session.supabase
    .from('thread_messages')
    .insert({ thread_id: threadId, sender_role: 'therapist', content: parsed.value })
    .select(STAFF_MESSAGE_COLUMNS)
    .single<StaffThreadMessage>()
  if (error) {
    // RLS refuses replies into closed threads.
    return { ok: false, error: error.code === '42501' ? 'This conversation is closed. Reopen it to reply.' : friendly(error) }
  }
  return { ok: true, data }
}

/** Closes or reopens a conversation. */
export async function setThreadStatus(threadId: string, status: ThreadStatus): Promise<ActionResult<ThreadStatus>> {
  if (!isUuid(threadId)) return { ok: false, error: NOT_FOUND }
  if (status !== 'open' && status !== 'closed') return { ok: false, error: 'Invalid status.' }
  const t = await therapistSession()
  if (t.error !== undefined) return { ok: false, error: t.error }

  const { data, error } = await t.session.supabase
    .from('therapist_threads')
    .update({ status })
    .eq('id', threadId)
    .select('status')
    .maybeSingle<{ status: ThreadStatus }>()
  if (error) return { ok: false, error: friendly(error) }
  if (!data) return { ok: false, error: NOT_FOUND }
  return { ok: true, data: data.status }
}
