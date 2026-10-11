'use server'

import { validateMoodInput, type ActionResult, type MoodLog } from '@rajs8952/core/mood'
import { fetchRange, MOOD_QUERY } from '@rajs8952/storage/supabase'
import { SIGNED_OUT, friendlyDbError, isUuid, signedInClient } from '@/lib/supabase/actions'

/*
 * Server actions for the Mood tracker. They run on the server with the
 * caller's session cookie, so row-level security still scopes every query
 * to the signed-in user. Errors are returned, not thrown: Next.js hides
 * thrown messages in production builds.
 */

const COLUMNS = MOOD_QUERY.columns
const friendly = (e: { code?: string; message: string }) => friendlyDbError(e, 'Mood')

export async function logMood(input: unknown): Promise<ActionResult<MoodLog>> {
  const parsed = validateMoodInput(input)
  if (!parsed.ok) return parsed

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await supabase.from('mood_logs').insert(parsed.value).select(COLUMNS).single()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: data as unknown as MoodLog }
}

/** Entries in [from, to) by {@link MOOD_QUERY}'s time column, newest first. */
export async function getMoodLogs(from: string, to: string): Promise<ActionResult<MoodLog[]>> {
  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }
  return fetchRange(supabase, MOOD_QUERY, { from, to })
}

export async function deleteMood(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { error } = await supabase.from('mood_logs').delete().eq('id', id)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}

/** Changes an entry's details (and, with input.logged_at, its time). Row-level security limits it to the caller's own. */
export async function updateMood(id: string, input: unknown): Promise<ActionResult<MoodLog>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }
  const parsed = validateMoodInput(input)
  if (!parsed.ok) return parsed

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await supabase.from('mood_logs').update(parsed.value).eq('id', id).select(COLUMNS).maybeSingle()
  if (error) return { ok: false, error: friendly(error) }
  if (!data) return { ok: false, error: 'That check-in wasn’t found.' }
  return { ok: true, data: data as unknown as MoodLog }
}
