'use server'

import { MEDITATION_QUERY, validateMeditationInput, type ActionResult, type MeditationLog } from '@/lib/meditation'
import { SIGNED_OUT, friendlyDbError, isUuid, signedInClient } from '@/lib/supabase/actions'
import { fetchRange } from '@/lib/supabase/queries'

/*
 * Server actions for the Meditation tracker. They run with the caller's
 * session cookie, so row-level security scopes every query to that user.
 */

const COLUMNS = MEDITATION_QUERY.columns

const friendly = (e: { code?: string; message: string }) => friendlyDbError(e, 'Meditation')

export async function logMeditation(input: unknown): Promise<ActionResult<MeditationLog>> {
  const parsed = validateMeditationInput(input)
  if (!parsed.ok) return parsed

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await supabase.from('meditation_logs').insert(parsed.value).select(COLUMNS).single()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: data as unknown as MeditationLog }
}

/** Entries in [from, to) by {@link MEDITATION_QUERY}'s time column, newest first. */
export async function getMeditationLogs(from: string, to: string): Promise<ActionResult<MeditationLog[]>> {
  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }
  return fetchRange(supabase, MEDITATION_QUERY, { from, to })
}

export async function deleteMeditation(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { error } = await supabase.from('meditation_logs').delete().eq('id', id)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}
