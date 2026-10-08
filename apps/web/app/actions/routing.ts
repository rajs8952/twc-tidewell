'use server'

import { isTeam, validateMessage, type Team } from '@/lib/messages'
import { SIGNED_OUT, isUuid, signedIn } from '@/lib/supabase/actions'
import type { ActionResult } from '@rajs8952/core/types'

/*
 * Sticky Queue routing engine (server actions).
 *
 * Each action checks the session and its inputs, then calls a database
 * function from supabase/sticky-routing.sql as the signed-in user. Those
 * functions do the routing and claiming in one transaction each, with row
 * locks, so capacity limits hold and two coaches can't claim the same query.
 */

export interface SubmittedQuery {
  threadId: string
  /** 'in_progress' when it went straight to the preferred coach, else 'unassigned' (the pool). */
  status: 'in_progress' | 'unassigned'
  /** True when it was routed to the user's previous coach. */
  assignedToPreferredCoach: boolean
}

export interface PoolItem {
  threadId: string
  createdAt: string
  userName: string
  firstMessage: string
  messageCount: number
}

function friendly(e: { code?: string; message: string }) {
  if (e.code === 'PGRST202') return 'Routing isn’t set up yet. Run supabase/sticky-routing.sql in Supabase first.'
  // The database functions raise readable messages (capacity, already claimed, not a coach…).
  return e.message
}

/**
 * Opens a new query for the signed-in employee. Goes straight to their
 * preferred coach for this category when that coach is accepting new
 * queries and below capacity; otherwise into the unassigned pool.
 */
export async function submitUserQuery(category: Team, initialMessage: string): Promise<ActionResult<SubmittedQuery>> {
  if (!isTeam(category)) return { ok: false, error: 'Choose therapist or dietitian.' }
  const parsed = validateMessage(initialMessage)
  if (!parsed.ok) return parsed
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase
    .rpc('submit_user_query', { p_category: category, p_message: parsed.value })
    .single<{ thread_id: string; status: 'in_progress' | 'unassigned'; assigned: boolean }>()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: { threadId: data.thread_id, status: data.status, assignedToPreferredCoach: data.assigned } }
}

/** The unassigned pool for the signed-in coach's category, oldest first. */
export async function getUnassignedQueue(category: Team): Promise<ActionResult<PoolItem[]>> {
  if (!isTeam(category)) return { ok: false, error: 'Choose therapist or dietitian.' }
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase.rpc('unassigned_queue', { p_category: category })
  if (error) return { ok: false, error: friendly(error) }
  return {
    ok: true,
    data: ((data ?? []) as { thread_id: string; created_at: string; user_name: string; first_message: string | null; message_count: number }[]).map((r) => ({
      threadId: r.thread_id,
      createdAt: r.created_at,
      userName: r.user_name,
      firstMessage: r.first_message ?? '',
      messageCount: r.message_count,
    })),
  }
}

/**
 * Claims a query from the pool for the signed-in coach: it becomes
 * in_progress and theirs, and they become the employee's preferred coach
 * for this category. Refused if the coach is at capacity, or if someone
 * else claimed it first.
 */
export async function claimTicket(threadId: string): Promise<ActionResult<{ threadId: string }>> {
  if (!isUuid(threadId)) return { ok: false, error: 'That query wasn’t found.' }
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await session.supabase.rpc('claim_ticket', { p_thread: threadId }).single<{ thread_id: string }>()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: { threadId: data.thread_id } }
}
