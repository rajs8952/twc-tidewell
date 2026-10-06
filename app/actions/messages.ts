'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  MAX_THREAD_MESSAGES,
  MESSAGE_COLUMNS,
  THREAD_COLUMNS,
  isTeam,
  validateMessage,
  type ActionResult,
  type Team,
  type TherapistThread,
  type ThreadMessage,
} from '@/lib/messages'
import { SIGNED_OUT, isUuid, signedIn } from '@/lib/supabase/actions'

/*
 * Server actions for the wellness-team inboxes (therapist and dietitian;
 * asynchronous secure messaging).
 * Each one checks the session first, then queries as the signed-in user, so
 * row-level security (supabase/therapist-messaging.sql) scopes everything to
 * their own threads. Users only ever write as sender_role 'user'; therapist
 * replies come from a separate, therapist-only path.
 */

const NOT_FOUND = 'That conversation wasn’t found.'

function friendly(e: { code?: string; message: string }) {
  if (e.code === 'PGRST205') return 'Messaging isn’t set up yet. Run supabase/therapist-messaging.sql in Supabase first.'
  // 42501: row-level security refused the write (not their thread, or it was closed meanwhile).
  if (e.code === '42501') return 'That message couldn’t be sent to this conversation.'
  return e.message
}

/** The caller's thread by id, or null if it doesn't exist or isn't theirs (RLS hides it). */
function findThread(supabase: SupabaseClient, threadId: string) {
  return supabase.from('therapist_threads').select(THREAD_COLUMNS).eq('id', threadId).maybeSingle<TherapistThread>()
}

/** The caller's threads with one team, newest first, for the inbox's conversation list. */
export async function getMyThreads(team: Team): Promise<ActionResult<TherapistThread[]>> {
  if (!isTeam(team)) return { ok: false, error: 'Unknown team.' }
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase
    .from('therapist_threads')
    .select(THREAD_COLUMNS)
    .eq('team', team)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<TherapistThread[]>()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: data ?? [] }
}

/**
 * Opens a new conversation with its first message. The message is validated
 * before anything is written, so an empty thread is only left behind if the
 * second insert fails; the result then carries the thread so the UI can retry
 * the message with sendMessage instead of opening another thread.
 */
export async function startThread(
  firstMessage: string,
  team: Team,
): Promise<ActionResult<{ thread: TherapistThread; message: ThreadMessage }> | { ok: false; error: string; thread: TherapistThread }> {
  const parsed = validateMessage(firstMessage)
  if (!parsed.ok) return parsed
  if (!isTeam(team)) return { ok: false, error: 'Unknown team.' }

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data: thread, error: threadError } = await session.supabase
    .from('therapist_threads')
    .insert({ team })
    .select(THREAD_COLUMNS)
    .single<TherapistThread>()
  if (threadError) return { ok: false, error: friendly(threadError) }

  const { data: message, error } = await session.supabase
    .from('thread_messages')
    .insert({ thread_id: thread.id, sender_role: 'user', content: parsed.value })
    .select(MESSAGE_COLUMNS)
    .single<ThreadMessage>()
  if (error) return { ok: false, error: friendly(error), thread }
  return { ok: true, data: { thread, message } }
}

/** Adds the user's message to one of their open threads. */
export async function sendMessage(content: string, threadId: string): Promise<ActionResult<ThreadMessage>> {
  const parsed = validateMessage(content)
  if (!parsed.ok) return parsed
  if (!isUuid(threadId)) return { ok: false, error: NOT_FOUND }

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  // Checked first only to give a clear message; RLS enforces the same rules on the insert.
  const { data: thread, error: threadError } = await findThread(session.supabase, threadId)
  if (threadError) return { ok: false, error: friendly(threadError) }
  if (!thread) return { ok: false, error: NOT_FOUND }
  if (thread.status !== 'open') return { ok: false, error: 'This conversation is closed. Start a new one to keep talking.' }

  const { data, error } = await session.supabase
    .from('thread_messages')
    .insert({ thread_id: threadId, sender_role: 'user', content: parsed.value })
    .select(MESSAGE_COLUMNS)
    .single<ThreadMessage>()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data }
}

/** One of the caller's threads with its latest messages, oldest first (reading order). */
export async function getThreadMessages(
  threadId: string,
): Promise<ActionResult<{ thread: TherapistThread; messages: ThreadMessage[] }>> {
  if (!isUuid(threadId)) return { ok: false, error: NOT_FOUND }

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const [{ data: thread, error: threadError }, { data: messages, error }] = await Promise.all([
    findThread(session.supabase, threadId),
    session.supabase
      .from('thread_messages')
      .select(MESSAGE_COLUMNS)
      .eq('thread_id', threadId)
      // Newest first so the limit keeps the latest messages; reversed into reading order below.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_THREAD_MESSAGES)
      .returns<ThreadMessage[]>(),
  ])
  if (threadError) return { ok: false, error: friendly(threadError) }
  if (!thread) return { ok: false, error: NOT_FOUND }
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: { thread, messages: (messages ?? []).reverse() } }
}
