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

/** Whose plan `current` and `loading` are: a different account signing in on this device starts afresh. */
let owner: string | null | undefined
let current: PlanInfo | null = null
let loading: Promise<PlanInfo> | null = null
const listeners = new Set<(p: PlanInfo | null) => void>()

/** The plan saved on this device last time (by whoever was signed in), if any. For the offline page. */
export function cachedPlan(): PlanInfo | null {
  return cached()
}

/** The saved plan, only if it belongs to `user` (when given). */
function cached(user?: string | null): PlanInfo | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as { user?: string; plan?: PlanInfo } | null
    if (!v?.plan || typeof v.plan.premium !== 'boolean') return null
    return user === undefined || v.user === user ? v.plan : null
  } catch {
    return null
  }
}

function publish(p: PlanInfo) {
  current = p
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ user: owner, plan: p }))
  } catch {
    /* fine: it's reloaded next visit */
  }
  listeners.forEach((l) => l(p))
}

/** The signed-in account (from the session on this device; no network call). */
async function signedInUser() {
  const { data } = await createClient().auth.getSession()
  return data.session?.user.id ?? null
}

/** Checks who's signed in first: another account's plan is never reused. */
async function load(): Promise<PlanInfo> {
  const user = await signedInUser()
  if (user !== owner) {
    owner = user
    current = null
    loading = null
    const saved = cached(user)
    listeners.forEach((l) => l(saved))
  }
  loading ??= (async () => {
    const { data, error } = await createClient().rpc('my_plan')
    if (owner !== user) return current ?? EVERYTHING // signed in as someone else meanwhile
    if (!error && data) publish(data as PlanInfo)
    else if (error?.code === 'PGRST202') publish(EVERYTHING) // not set up yet
    else loading = null
    return current ?? cached(user) ?? EVERYTHING
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
  // `current` avoids a loading flash between screens; load() replaces it at once if someone else signed in.
  const [plan, setPlan] = useState<PlanInfo | null>(current)
  useEffect(() => {
    listeners.add(setPlan)
    load().then(setPlan, () => undefined)
    return () => {
      listeners.delete(setPlan)
    }
  }, [])
  return plan
}
