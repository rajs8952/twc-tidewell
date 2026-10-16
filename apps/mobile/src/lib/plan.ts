import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { readCache, saveCache } from './cache'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * The signed-in person's plan (my_plan() in supabase/subscriptions.sql),
 * the same answer the website uses. It only decides what the screens
 * show: the database itself refuses Premium actions (chat, contacts) for
 * Free accounts.
 * ------------------------------------------------------------------ */

export interface PlanInfo {
  premium: boolean
  staff: boolean
  plan: 'free' | 'premium'
  source: 'none' | 'trial' | 'paid' | 'company' | 'grandfathered' | 'admin'
  premium_until: string | null
  billing_period?: 'monthly' | 'yearly' | null
  status?: 'active' | 'past_due' | 'cancelled' | 'halted'
  cancel_at_period_end?: boolean
}

/**
 * Whether the app offers buying Premium (Razorpay, through the website). Apple
 * normally requires its own in-app purchase for this, so turn it off for the
 * App Store build unless OmniWell is only provided by companies (iOS).
 */
export const CAN_UPGRADE_IN_APP = true

/** Before supabase/subscriptions.sql is run, everyone keeps everything. */
const EVERYTHING: PlanInfo = { premium: true, staff: false, plan: 'premium', source: 'grandfathered', premium_until: null }

let current: PlanInfo | null = null

export async function loadPlan(): Promise<PlanInfo> {
  const { data, error } = await supabase.rpc('my_plan')
  if (!error && data) {
    current = data as PlanInfo
    void saveCache('plan', current)
  } else if (error?.code === 'PGRST202') current = EVERYTHING
  else if (!current) current = (await readCache<PlanInfo>('plan'))?.data ?? null
  if (!current) throw new Error(error?.message ?? 'Couldn’t load your plan.')
  return current
}

export function clearPlan() {
  current = null
}

/** The plan, re-read whenever the screen comes into view; null until known. */
export function usePlan() {
  const [plan, setPlan] = useState<PlanInfo | null>(current)
  useFocusEffect(
    useCallback(() => {
      let alive = true
      loadPlan().then(
        (p) => alive && setPlan(p),
        () => {},
      )
      return () => {
        alive = false
      }
    }, []),
  )
  return plan
}

export const daysLeft = (until: string | null) => (until ? Math.max(0, Math.ceil((Date.parse(until) - Date.now()) / 86_400_000)) : null)
