'use server'

import { EXERCISE_QUERY, fetchRange, MEDITATION_QUERY, MOOD_QUERY, SLEEP_QUERY, WEIGHT_QUERY } from '@rajs8952/storage/supabase'
import { SIGNED_OUT, signedInClient } from '@/lib/supabase/actions'
import type { ActionResult, DateRange } from '@rajs8952/core/types'
import type { TrackerData } from '@rajs8952/trackers/hub'

export interface TrackerRanges {
  mood: DateRange
  meditation: DateRange
  sleep: DateRange
  weight: DateRange
  exercise: DateRange
}

export type { TrackerData }

/**
 * Every tracker's first screen of data in one round trip. Next.js runs a
 * page's server actions one at a time, so five separate loads queued up;
 * here the five queries run in parallel on the server instead. Results stay
 * per tracker, so one failing query only affects its own card.
 */
export async function getTrackerData(ranges: TrackerRanges): Promise<TrackerData> {
  const supabase = await signedInClient()
  if (!supabase) {
    const out: ActionResult<never[]> = { ok: false, error: SIGNED_OUT }
    return { mood: out, meditation: out, sleep: out, weight: out, exercise: out }
  }

  const [mood, meditation, sleep, weight, exercise] = await Promise.all([
    fetchRange(supabase, MOOD_QUERY, ranges?.mood),
    fetchRange(supabase, MEDITATION_QUERY, ranges?.meditation),
    fetchRange(supabase, SLEEP_QUERY, ranges?.sleep),
    fetchRange(supabase, WEIGHT_QUERY, ranges?.weight),
    fetchRange(supabase, EXERCISE_QUERY, ranges?.exercise),
  ])
  return { mood, meditation, sleep, weight, exercise }
}
