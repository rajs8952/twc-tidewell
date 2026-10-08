'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_THREAD_MESSAGES,
  MESSAGE_COLUMNS,
  STAFF_MESSAGE_COLUMNS,
  THREAD_COLUMNS,
  type QueueItem,
  type StaffThreadMessage,
  type Team,
  type TherapistThread,
  type ThreadMessage,
  type ThreadStatus,
} from './messages'

/* ------------------------------------------------------------------
 * Chat data, straight from the browser to Supabase.
 *
 * Every query runs as the signed-in user, so row-level security
 * (supabase/therapist-messaging.sql, supabase/therapist-portal.sql) is
 * the gatekeeper: employees only reach their own threads and can only
 * write as 'user'; staff only reach their own team's threads. Going
 * direct (rather than through server actions) makes a send one round
 * trip, and polls never queue behind sends.
 * ------------------------------------------------------------------ */

export class ChatError extends Error {}

function fail(e: { code?: string; message: string }, context: 'send' | 'load'): never {
  if (e.code === 'PGRST205' || e.code === 'PGRST202') throw new ChatError('Messaging isn’t set up yet.')
  if (e.code === '42501') throw new ChatError(context === 'send' ? 'This conversation is closed or isn’t available.' : 'You don’t have access to this conversation.')
  if (/fetch|network/i.test(e.message)) throw new ChatError('Couldn’t reach the server. Check your connection.')
  throw new ChatError(e.message)
}

/** The signed-in user's id from the local session (no network call). */
export async function myUserId(supabase: SupabaseClient) {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** Re-asks for messages a few seconds older than the newest one seen, so a message committed slightly out of order isn't missed. */
const OVERLAP_MS = 5_000
const since = (iso: string) => new Date(new Date(iso).getTime() - OVERLAP_MS).toISOString()

/** Merges messages by id, oldest first. */
export function mergeMessages<T extends ThreadMessage>(current: T[], incoming: T[]): T[] {
  if (!incoming.length) return current
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/* ---------- Employees ---------- */

export interface ChatSummary extends TherapistThread {
  last: Pick<ThreadMessage, 'sender_role' | 'content' | 'created_at'> | null
}

/** All the employee's conversations (both teams), newest activity first, with their last message. */
export async function listMyChats(supabase: SupabaseClient): Promise<ChatSummary[]> {
  const { data: threads, error } = await supabase.from('therapist_threads').select(THREAD_COLUMNS).order('created_at', { ascending: false }).limit(50).returns<TherapistThread[]>()
  if (error) fail(error, 'load')
  if (!threads?.length) return []
  const { data: recent, error: msgError } = await supabase
    .from('thread_messages')
    .select('thread_id, sender_role, content, created_at')
    .in('thread_id', threads.map((t) => t.id))
    .order('created_at', { ascending: false })
    .limit(300)
    .returns<(ThreadMessage & { thread_id: string })[]>()
  if (msgError) fail(msgError, 'load')
  const last = new Map<string, ChatSummary['last']>()
  for (const m of recent ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, { sender_role: m.sender_role, content: m.content, created_at: m.created_at })
  return threads
    .map((t) => ({ ...t, last: last.get(t.id) ?? null }))
    .sort((a, b) => (b.last?.created_at ?? b.created_at).localeCompare(a.last?.created_at ?? a.created_at))
}

/** A thread's latest messages, oldest first. */
export async function loadMessages(supabase: SupabaseClient, threadId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase
    .from('thread_messages')
    .select(MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(MAX_THREAD_MESSAGES)
    .returns<ThreadMessage[]>()
  if (error) fail(error, 'load')
  return (data ?? []).reverse()
}

/** What's new since `newest` (plus the thread's status), in one round trip. */
export async function pollThread(supabase: SupabaseClient, threadId: string, newest: string | null) {
  let q = supabase.from('thread_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId)
  if (newest) q = q.gte('created_at', since(newest))
  const [msgs, thread] = await Promise.all([
    q.order('created_at', { ascending: true }).limit(100).returns<ThreadMessage[]>(),
    supabase.from('therapist_threads').select('status').eq('id', threadId).maybeSingle<{ status: ThreadStatus }>(),
  ])
  if (msgs.error) fail(msgs.error, 'load')
  return { messages: msgs.data ?? [], status: thread.data?.status ?? null }
}

/** Sends the employee's message (row-level security only allows 'user' into their own open threads). */
export async function sendUserMessage(supabase: SupabaseClient, threadId: string, content: string): Promise<ThreadMessage> {
  const { data, error } = await supabase.from('thread_messages').insert({ thread_id: threadId, sender_role: 'user', content }).select(MESSAGE_COLUMNS).single<ThreadMessage>()
  if (error) fail(error, 'send')
  return data
}

/** Opens a conversation with a team. */
export async function startChat(supabase: SupabaseClient, team: Team): Promise<TherapistThread> {
  const { data, error } = await supabase.from('therapist_threads').insert({ team }).select(THREAD_COLUMNS).single<TherapistThread>()
  if (error) fail(error, 'send')
  return data
}

/* ---------- Staff (therapists and dietitians) ---------- */

/** The caller's team queue (therapist_queue() only returns their own team). */
export async function loadQueue(supabase: SupabaseClient): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('therapist_queue')
  if (error) fail(error, 'load')
  return (data ?? []) as QueueItem[]
}

export async function loadStaffMessages(supabase: SupabaseClient, threadId: string): Promise<StaffThreadMessage[]> {
  const { data, error } = await supabase
    .from('thread_messages')
    .select(STAFF_MESSAGE_COLUMNS)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(MAX_THREAD_MESSAGES)
    .returns<StaffThreadMessage[]>()
  if (error) fail(error, 'load')
  return (data ?? []).reverse()
}

export async function pollStaffThread(supabase: SupabaseClient, threadId: string, newest: string | null) {
  let q = supabase.from('thread_messages').select(STAFF_MESSAGE_COLUMNS).eq('thread_id', threadId)
  if (newest) q = q.gte('created_at', since(newest))
  const [msgs, thread] = await Promise.all([
    q.order('created_at', { ascending: true }).limit(100).returns<StaffThreadMessage[]>(),
    supabase.from('therapist_threads').select('status').eq('id', threadId).maybeSingle<{ status: ThreadStatus }>(),
  ])
  if (msgs.error) fail(msgs.error, 'load')
  return { messages: msgs.data ?? [], status: thread.data?.status ?? null }
}

/** A staff reply ('therapist' means wellness staff; row-level security checks the team and that it's open). */
export async function sendStaffReply(supabase: SupabaseClient, threadId: string, content: string): Promise<StaffThreadMessage> {
  const { data, error } = await supabase.from('thread_messages').insert({ thread_id: threadId, sender_role: 'therapist', content }).select(STAFF_MESSAGE_COLUMNS).single<StaffThreadMessage>()
  if (error) fail(error, 'send')
  return data
}

export async function setChatStatus(supabase: SupabaseClient, threadId: string, status: ThreadStatus): Promise<ThreadStatus> {
  const { data, error } = await supabase.from('therapist_threads').update({ status }).eq('id', threadId).select('status').maybeSingle<{ status: ThreadStatus }>()
  if (error) fail(error, 'send')
  if (!data) throw new ChatError('That conversation wasn’t found.')
  return data.status
}
