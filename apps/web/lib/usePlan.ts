'use client'

import { useEffect, useState } from 'react'
import { storageKey } from '@/lib/brand'
import { EVERYTHING, type PlanInfo } from '@/lib/plans'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------
 * The signed-in person's plan (my_plan() in supabase/subscriptions.sql),
 * loaded once per visit and shared by every screen. The last answer is
 * kept on the device so locks don't flicker while it loads. Before the
 * SQL is run, everyone is treated as Premium.
 *
 * This only decides what the screens show; the database enforces the
 * locks that matter (chat, programmes, contacts, reminders).
 * ------------------------------------------------------------------ */

const CACHE_KEY = storageKey('plan')

let current: PlanInfo | null = null
let loading: Promise<PlanInfo> | null = null
const listeners = new Set<(p: PlanInfo) => void>()

/** The plan saved on this device last time, if any. */
export function cachedPlan(): PlanInfo | null {
  return cached()
}

function cached(): PlanInfo | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as PlanInfo | null
    return v && typeof v.premium === 'boolean' ? v : null
  } catch {
    return null
  }
}

function publish(p: PlanInfo) {
  current = p
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p))
  } catch {
    /* fine: it's reloaded next visit */
  }
  listeners.forEach((l) => l(p))
}

function load(): Promise<PlanInfo> {
  loading ??= (async () => {
    const { data, error } = await createClient().rpc('my_plan')
    if (!error && data) publish(data as PlanInfo)
    else if (error?.code === 'PGRST202') publish(EVERYTHING) // not set up yet
    else loading = null
    return current ?? cached() ?? EVERYTHING
  })()
  return loading
}

/** Re-read the plan (after an upgrade or an admin change). */
export function refreshPlan() {
  loading = null
  return load()
}

/** The plan, or null until it's known (first visit on this device). */
export function usePlan(): PlanInfo | null {
  const [plan, setPlan] = useState<PlanInfo | null>(current)
  useEffect(() => {
    listeners.add(setPlan)
    if (!current) {
      const saved = cached()
      if (saved) setPlan(saved)
    }
    load().then(setPlan, () => undefined)
    return () => {
      listeners.delete(setPlan)
    }
  }, [])
  return plan
}
