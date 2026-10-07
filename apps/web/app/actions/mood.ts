'use server'

import { validateMoodInput, type ActionResult, type MoodLog } from '@omniwell/core/mood'
import { SIGNED_OUT, friendlyDbError, isUuid, signedInClient } from '@/lib/supabase/actions'
import { MOOD_QUERY } from '@/lib/supabase/tables'
import { fetchRange } from '@/lib/supabase/queries'

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
