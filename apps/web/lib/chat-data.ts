'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_THREAD_MESSAGES,
  MESSAGE_COLUMNS,
  RECEIPT_COLUMNS,
  STAFF_MESSAGE_COLUMNS,
  THREAD_COLUMNS,
  type CoachProfile,
  type QueueItem,
  type StaffThreadMessage,
  type TherapistThread,
  type ThreadMessage,
  type ThreadReceipts,
  type ThreadStatus,
  CHAT_IMAGE_LINK_SECONDS,
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
  last: Pick<ThreadMessage, 'sender_role' | 'content' | 'created_at' | 'media_url'> | null
  /** The assigned coach's display name; null while it's waiting in the pool. */
  coach_name: string | null
}

/* ---------- Receipts (supabase/chat-receipts-and-scoping.sql) ---------- */

/**
 * Tells the database the caller's app has received the other side's latest
 * messages (on every chat-list or queue load). Fire and forget: a failure
 * only means ticks update a little later.
 */
export function markDelivered(supabase: SupabaseClient) {
  supabase.rpc('mark_threads_delivered').then(() => {}, () => {})
}

/** The caller has the conversation open on screen: its messages count as read. */
export function markRead(supabase: SupabaseClient, threadId: string) {
  supabase.rpc('mark_thread_read', { p_thread: threadId }).then(() => {}, () => {})
}

type ThreadPoll = { status: ThreadStatus } & ThreadReceipts

/** All the employee's conversations (both teams), newest activity first, with their last message. */
export async function listMyChats(supabase: SupabaseClient): Promise<ChatSummary[]> {
  const [{ data: threads, error }, coaches] = await Promise.all([
    supabase.from('therapist_threads').select(THREAD_COLUMNS).order('created_at', { ascending: false }).limit(50).returns<TherapistThread[]>(),
    supabase.rpc('my_chat_coaches'),
  ])
  if (error) fail(error, 'load')
  if (!threads?.length) return []
  markDelivered(supabase)
  const coachOf = new Map(((coaches.data ?? []) as { thread_id: string; coach_name: string }[]).map((c) => [c.thread_id, c.coach_name]))
  const { data: recent, error: msgError } = await supabase
    .from('thread_messages')
    .select('thread_id, sender_role, content, created_at, media_url')
    .in('thread_id', threads.map((t) => t.id))
    .order('created_at', { ascending: false })
    .limit(300)
    .returns<(ThreadMessage & { thread_id: string })[]>()
  if (msgError) fail(msgError, 'load')
  const last = new Map<string, ChatSummary['last']>()
  for (const m of recent ?? []) if (!last.has(m.thread_id)) last.set(m.thread_id, { sender_role: m.sender_role, content: m.content, created_at: m.created_at, media_url: m.media_url })
  return threads
    .map((t) => ({ ...t, last: last.get(t.id) ?? null, coach_name: coachOf.get(t.id) ?? null }))
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

/** What's new since `newest`, plus the thread's status and receipts, in one round trip. */
export async function pollThread(supabase: SupabaseClient, threadId: string, newest: string | null) {
  let q = supabase.from('thread_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId)
  if (newest) q = q.gte('created_at', since(newest))
  const [msgs, thread] = await Promise.all([
    q.order('created_at', { ascending: true }).limit(100).returns<ThreadMessage[]>(),
    supabase.from('therapist_threads').select(`status, ${RECEIPT_COLUMNS}`).eq('id', threadId).maybeSingle<ThreadPoll>(),
  ])
  if (msgs.error) fail(msgs.error, 'load')
  return { messages: msgs.data ?? [], status: thread.data?.status ?? null, receipts: thread.data ?? null }
}

/** An uploaded image's path (from app/actions/chat-media.ts) as message columns. */
const mediaColumns = (imagePath?: string | null) => (imagePath ? { media_url: imagePath, media_type: 'image' as const } : {})

/**
 * Sends the employee's message, optionally with an uploaded image (row-level
 * security only allows 'user' into their own open threads).
 */
export async function sendUserMessage(supabase: SupabaseClient, threadId: string, content: string, imagePath?: string | null): Promise<ThreadMessage> {
  const { data, error } = await supabase.from('thread_messages').insert({ thread_id: threadId, sender_role: 'user', content, ...mediaColumns(imagePath) }).select(MESSAGE_COLUMNS).single<ThreadMessage>()
  if (error) fail(error, 'send')
  return data
}

/* ---------- Staff (therapists and dietitians) ---------- */

/** The caller's team queue (therapist_queue() only returns their own team). */
export async function loadQueue(supabase: SupabaseClient): Promise<QueueItem[]> {
  const { data, error } = await supabase.rpc('therapist_queue')
  if (error) fail(error, 'load')
  markDelivered(supabase)
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
    supabase.from('therapist_threads').select(`status, ${RECEIPT_COLUMNS}`).eq('id', threadId).maybeSingle<ThreadPoll>(),
  ])
  if (msgs.error) fail(msgs.error, 'load')
  return { messages: msgs.data ?? [], status: thread.data?.status ?? null, receipts: thread.data ?? null }
}

/** A staff reply, optionally with an image ('therapist' means wellness staff; row-level security checks the team and that it's open). */
export async function sendStaffReply(supabase: SupabaseClient, threadId: string, content: string, imagePath?: string | null): Promise<StaffThreadMessage> {
  const { data, error } = await supabase.from('thread_messages').insert({ thread_id: threadId, sender_role: 'therapist', content, ...mediaColumns(imagePath) }).select(STAFF_MESSAGE_COLUMNS).single<StaffThreadMessage>()
  if (error) fail(error, 'send')
  return data
}

/**
 * Resolves (closes) or reopens a conversation. Uses set_thread_resolved()
 * from supabase/sticky-queue.sql, which reopens to in_progress or the
 * unassigned pool; before that's installed, falls back to open/closed.
 */
export async function setChatResolved(supabase: SupabaseClient, threadId: string, resolved: boolean): Promise<ThreadStatus> {
  const rpc = await supabase.rpc('set_thread_resolved', { p_thread: threadId, p_resolved: resolved })
  if (!rpc.error) return rpc.data as ThreadStatus
  if (rpc.error.code !== 'PGRST202') fail(rpc.error, 'send')
  const { data, error } = await supabase.from('therapist_threads').update({ status: resolved ? 'closed' : 'open' }).eq('id', threadId).select('status').maybeSingle<{ status: ThreadStatus }>()
  if (error) fail(error, 'send')
  if (!data) throw new ChatError('That conversation wasn’t found.')
  return data.status
}

/* ---------- Coach capacity (supabase/sticky-queue.sql) ---------- */

const COACH_COLUMNS = 'user_id, category, is_accepting_new, max_capacity, current_load'

/** The signed-in coach's capacity settings and live load; null if they aren't a coach (or before sticky-queue.sql). */
export async function loadMyCoachProfile(supabase: SupabaseClient): Promise<CoachProfile | null> {
  const me = await myUserId(supabase)
  if (!me) return null
  const { data, error } = await supabase.from('coach_profiles').select(COACH_COLUMNS).eq('user_id', me).maybeSingle<CoachProfile>()
  if (error) return null
  return data
}

/** Turns "accepting new" on or off for the signed-in coach (row-level security limits it to their own row). */
export async function setAcceptingNew(supabase: SupabaseClient, accepting: boolean): Promise<CoachProfile> {
  const me = await myUserId(supabase)
  const { data, error } = await supabase.from('coach_profiles').update({ is_accepting_new: accepting }).eq('user_id', me ?? '').select(COACH_COLUMNS).maybeSingle<CoachProfile>()
  if (error) fail(error, 'send')
  if (!data) throw new ChatError('Your coach profile wasn’t found.')
  return data
}

/* ---------- Images ---------- */

/**
 * Short-lived viewing links for chat images, in one request. The bucket is
 * private: storage's row-level security only signs images in threads the
 * caller belongs to. Paths it won't sign come back missing.
 */
export async function signImageUrls(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data, error } = await supabase.storage.from('chat_media').createSignedUrls(paths, CHAT_IMAGE_LINK_SECONDS)
  if (error) return out
  for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out.set(r.path, r.signedUrl)
  return out
}
