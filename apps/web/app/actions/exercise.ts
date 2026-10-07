'use server'

import { toExerciseLog, validateExerciseInput, type ActionResult, type ExerciseLog } from '@omniwell/core/exercise'
import { SIGNED_OUT, friendlyDbError, isUuid, signedInClient } from '@/lib/supabase/actions'
import { EXERCISE_QUERY } from '@/lib/supabase/tables'
import { fetchRange } from '@/lib/supabase/queries'

/*
 * Server actions for the Exercise tracker. They run with the caller's
 * session cookie, so row-level security scopes every query to that user.
 */

const COLUMNS = EXERCISE_QUERY.columns

const friendly = (e: { code?: string; message: string }) => friendlyDbError(e, 'Exercise')

export async function logExercise(input: unknown): Promise<ActionResult<ExerciseLog>> {
  const parsed = validateExerciseInput(input)
  if (!parsed.ok) return parsed

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { data, error } = await supabase.from('exercise_logs').insert(parsed.value).select(COLUMNS).single()
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: toExerciseLog(data as unknown as Record<string, unknown>) }
}

/** Entries in [from, to) by {@link EXERCISE_QUERY}'s time column, newest first. */
export async function getExerciseLogs(from: string, to: string): Promise<ActionResult<ExerciseLog[]>> {
  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }
  return fetchRange(supabase, EXERCISE_QUERY, { from, to })
}

export async function deleteExercise(id: string): Promise<ActionResult<null>> {
  if (!isUuid(id)) return { ok: false, error: 'Invalid entry.' }

  const supabase = await signedInClient()
  if (!supabase) return { ok: false, error: SIGNED_OUT }

  const { error } = await supabase.from('exercise_logs').delete().eq('id', id)
  if (error) return { ok: false, error: friendly(error) }
  return { ok: true, data: null }
}
