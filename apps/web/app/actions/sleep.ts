'use server'

import { validateSleepInput, type ActionResult, type SleepLog } from '@rajs8952/core/sleep'
import { fetchRange, SLEEP_QUERY } from '@rajs8952/storage/supabase'
import { SIGNED_OUT, friendlyDbError, isUuid, signedInClient } from '@/lib/supabase/actions'

/*
 * Server actions for the Sleep tracker. They run with the caller's session
 * cookie, so row-level security scopes every query to that user.
 */

const COLUMNS = SLEEP_QUERY.columns

const friendly = (e: { code?: string; message: string }) => friendlyDbError(e, 'Sleep')

export async function logSleep(input: unknown): Promise<ActionResult<SleepLog>> {
  const parsed = validateSleepInput(input)
  if (!parsed.ok) return parsed

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await supabase.from('sleep_logs').insert(parsed.value).select(COLUMNS).single()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: data as unknown as SleepLog }
}

/** Entries in [from, to) by {@link SLEEP_QUERY}'s time column, newest first. */
export async function getSleepLogs(from: string, to: string): Promise<ActionResult<SleepLog[]>> {
  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }
  return fetchRange(supabase, SLEEP_QUERY, { from, to })
}

export async function deleteSleep(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { error } = await supabase.from('sleep_logs').delete().eq('id', id)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}
