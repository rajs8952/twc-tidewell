'use server'

import { SIGNED_OUT, friendlyDbError, isUuid, signedIn, signedInClient } from '@/lib/supabase/actions'
import { fetchRange } from '@/lib/supabase/queries'
import { WEIGHT_QUERY } from '@/lib/supabase/tables'
import { toWeightLog, validateWeightInput, type ActionResult, type WeightLog } from '@omniwell/core/weight'

/*
 * Server actions for the Weight tracker. They run with the caller's session
 * cookie, so row-level security scopes every query to that user.
 */

const COLUMNS = WEIGHT_QUERY.columns

const friendly = (e: { code?: string; message: string }) => friendlyDbError(e, 'Weight')

/**
 * Saves an entry. With sync_profile, also sets profiles.weight_kg so the
 * water goal follows; a failure there is reported but keeps the entry.
 */
export async function logWeight(input: unknown): Promise<ActionResult<{ log: WeightLog; profileSynced: boolean }>> {
  const parsed = validateWeightInput(input)
  if (!parsed.ok) return parsed

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const { supabase, userId } = session
  const { sync_profile, ...row } = parsed.value

  const { data, error } = await supabase.from('weight_logs').insert(row).select(COLUMNS).single()
  if (error) return { ok: false, error: friendly(error) }

  let profileSynced = false
  if (sync_profile) {
    const { error: profileError } = await supabase.from('profiles').update({ weight_kg: row.weight_kg }).eq('id', userId)
    profileSynced = !profileError
  }
  return { ok: true, data: { log: toWeightLog(data as unknown as Record<string, unknown>), profileSynced } }
}

/** Entries in [from, to) by {@link WEIGHT_QUERY}'s time column, newest first. */
export async function getWeightLogs(from: string, to: string): Promise<ActionResult<WeightLog[]>> {
  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }
  return fetchRange(supabase, WEIGHT_QUERY, { from, to })
}

export async function deleteWeight(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { error } = await supabase.from('weight_logs').delete().eq('id', id)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}
