'use server'

import { effectiveGoal, type Activity, type Gender } from '@omniwell/core/hydration'
import { analyzeRollup, shiftDate, type Insights } from '@/lib/insights/analyze'
import { buildHeadline } from '@/lib/insights/headline'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'
import type { ActionResult } from '@omniwell/core/types'

/*
 * Insights Engine, phase 2: fetches the last N days from daily_wellness_rollup
 * (supabase/insights.sql); lib/insights/analyze.ts computes the Spearman correlations.
 * Runs with the caller's session, so the view's RLS returns only their rows.
 */

const DEFAULT_DAYS = 30

const isValidTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** YYYY-MM-DD for "now" in a timezone. */
const localToday = (tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())

/** The last `days` local days (default 30, 7–90) with Spearman correlations between water, sleep and mood. */
export async function getInsights(days: number = DEFAULT_DAYS): Promise<ActionResult<Insights>> {
  const span = Number.isInteger(days) ? Math.min(Math.max(days, 7), 90) : DEFAULT_DAYS

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const { supabase, userId } = session

  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone, weight_kg, gender, activity_level, custom_goal_ml')
    .eq('id', userId)
    .maybeSingle()
  const p = (profile ?? {}) as {
    timezone?: string
    weight_kg?: number | string
    gender?: Gender
    activity_level?: Activity
    custom_goal_ml?: number | null
  }
  const timezone = p.timezone && isValidTz(p.timezone) ? p.timezone : 'UTC'
  // Today's goal, applied to every day in the window (the same simplification streaks use).
  const goalMl = effectiveGoal({
    weight_kg: Number(p.weight_kg ?? 70),
    gender: p.gender ?? 'unspecified',
    activity_level: p.activity_level ?? 'moderate',
    custom_goal_ml: p.custom_goal_ml == null ? null : Number(p.custom_goal_ml),
  })

  const to = localToday(timezone)
  const from = shiftDate(to, -(span - 1))

  const { data, error } = await supabase
    .from('daily_wellness_rollup')
    .select('date, total_water_ml, total_sleep_minutes, average_mood_score')
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
  if (error) {
    return {
      ok: false,
      error: error.code === 'PGRST205' ? 'Insights aren’t set up yet. Run supabase/insights.sql in Supabase first.' : error.message,
    }
  }

  const analysis = analyzeRollup(data ?? [], from, span)
  const headline = buildHeadline(analysis.insights, analysis.days, goalMl, span)
  return { ok: true, data: { timezone, goalMl, from, to, ...analysis, headline } }
}
