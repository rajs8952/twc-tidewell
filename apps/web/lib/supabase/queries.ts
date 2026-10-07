import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActionResult, DateRange } from '@omniwell/core/types'
import { friendlyDbError, isIsoDate } from './actions'
import type { RangeQuery } from './tables'

/**
 * Lists a tracker's entries whose timeColumn falls in [from, to), newest
 * first. Used by each tracker's own "get" action and by the dashboard
 * loader, so both always return the same shape.
 */
export async function fetchRange<T>(supabase: SupabaseClient, q: RangeQuery<T>, range: DateRange): Promise<ActionResult<T[]>> {
  if (!isIsoDate(range?.from) || !isIsoDate(range?.to)) return { ok: false, error: 'Invalid date range.' }

  const { data, error } = await supabase
    .from(q.table)
    .select(q.columns)
    .gte(q.timeColumn, range.from)
    .lt(q.timeColumn, range.to)
    .order(q.timeColumn, { ascending: false })
    .limit(500)
  if (error) return { ok: false, error: friendlyDbError(error, q.name) }

  const rows = (data ?? []) as unknown as Record<string, unknown>[]
  return { ok: true, data: q.map ? rows.map(q.map) : (rows as T[]) }
}
