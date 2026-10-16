import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { BillingPeriod } from '@/lib/plans'
import { RazorpayNotConfigured, cancelSubscription, createSubscription, fetchSubscription, paidUntil, periodOfPlan, razorpayConfig, type RazorpaySubscription } from '@/lib/razorpay'
import { supabaseAdmin } from '@/lib/supabase/admin'

/* ------------------------------------------------------------------
 * Premium payments, shared by the website (app/actions/billing.ts) and
 * the OmniWell app (app/api/mobile/billing). Each takes the signed-in
 * person as found by its own caller (cookies or the app's bearer token).
 * Plans are written with the service role: people can't change their own
 * plan (supabase/subscriptions.sql).
 * ------------------------------------------------------------------ */

export interface Payer {
  supabase: SupabaseClient
  userId: string
}

type Row = { source: string; plan: string; premium_until: string | null; provider_subscription_id: string | null; status: string }
type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export const billingError = (e: unknown) => (e instanceof RazorpayNotConfigured ? e.message : `Payment service: ${(e as Error).message}`)

export async function billingContext(payer: Payer) {
  const admin = supabaseAdmin()
  if (!admin) return { error: 'The payment service isn’t configured on the server (SUPABASE_SERVICE_ROLE_KEY).' }
  const { data: role } = await payer.supabase.rpc('my_role')
  const { data: row } = await admin.from('subscriptions').select('source, plan, premium_until, provider_subscription_id, status').eq('user_id', payer.userId).maybeSingle<Row>()
  return { admin, staff: role === 'coach' || role === 'admin' || role === 'hr', row }
}

/** A new Razorpay subscription for this person, remembered so only they can confirm it. */
export async function beginCheckout(payer: Payer, period: BillingPeriod): Promise<Result<{ sub: RazorpaySubscription; keyId: string; testMode: boolean }>> {
  if (period !== 'monthly' && period !== 'yearly') return { ok: false, error: 'Choose monthly or yearly.' }
  const ctx = await billingContext(payer)
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { admin, staff, row } = ctx
  // Premium that doesn't need paying for: staff, company, early members, admin grants, or an active paid plan.
  if (staff || (row && ['company', 'grandfathered', 'admin'].includes(row.source) && row.plan === 'premium')) return { ok: false, error: 'You already have Premium; there’s nothing to pay.' }
  if (row?.source === 'paid' && row.status === 'active' && row.premium_until && Date.parse(row.premium_until) > Date.now()) return { ok: false, error: 'You already have a paid Premium plan.' }
  try {
    const { keyId, testMode } = razorpayConfig()
    const sub = await createSubscription(period, payer.userId)
    const { error } = await admin.from('subscriptions').upsert({ user_id: payer.userId, provider: 'razorpay', provider_subscription_id: sub.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return { ok: false, error: `Couldn’t start the payment: ${error.message}` }
    return { ok: true, data: { sub, keyId, testMode } }
  } catch (e) {
    return { ok: false, error: billingError(e) }
  }
}

/**
 * After paying on Razorpay's own page (the app's checkout): asks Razorpay for this
 * person's latest subscription and, once it's paid, turns Premium on. Trusts only
 * what Razorpay itself reports, for a subscription that is in this person's name.
 * The webhook does the same; whichever comes first wins, and repeats are harmless.
 */
export async function syncCheckout(payer: Payer): Promise<Result<{ premium: boolean; premiumUntil: string | null }>> {
  const ctx = await billingContext(payer)
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { admin, row } = ctx
  if (!row?.provider_subscription_id) return { ok: true, data: { premium: false, premiumUntil: null } }
  try {
    const sub = await fetchSubscription(row.provider_subscription_id)
    const notes = Array.isArray(sub.notes) ? {} : sub.notes
    if (notes.user_id !== payer.userId) return { ok: false, error: 'That payment belongs to a different account.' }
    const period = periodOfPlan(sub.plan_id)
    if (!period || (sub.status !== 'active' && sub.status !== 'authenticated')) return { ok: true, data: { premium: false, premiumUntil: null } }
    if (row.source === 'paid' && row.plan === 'premium' && row.status === 'active') return { ok: true, data: { premium: true, premiumUntil: row.premium_until } }
    const premiumUntil = paidUntil(sub, period)
    const { error } = await admin
      .from('subscriptions')
      .update({ plan: 'premium', source: 'paid', billing_period: period, premium_until: premiumUntil, status: 'active', cancel_at_period_end: false, provider: 'razorpay', provider_customer_id: sub.customer_id, updated_at: new Date().toISOString() })
      .eq('user_id', payer.userId)
    if (error) return { ok: false, error: `Payment received, but saving your plan failed: ${error.message}. It will be fixed automatically.` }
    console.info(`[billing] premium ${period} for ${payer.userId} via ${sub.id} (synced)`)
    return { ok: true, data: { premium: true, premiumUntil } }
  } catch (e) {
    return { ok: false, error: billingError(e) }
  }
}

/** Stops the subscription on Razorpay now; Premium continues until the paid period ends. */
export async function stopRenewal(payer: Payer): Promise<Result<{ premiumUntil: string | null }>> {
  const ctx = await billingContext(payer)
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { admin, row } = ctx
  if (row?.source !== 'paid' || !row.provider_subscription_id) return { ok: false, error: 'There’s no paid plan to cancel.' }
  try {
    await cancelSubscription(row.provider_subscription_id)
    const { error } = await admin.from('subscriptions').update({ status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('user_id', payer.userId)
    if (error) return { ok: false, error: error.message }
    console.info(`[billing] renewal cancelled for ${payer.userId}`)
    return { ok: true, data: { premiumUntil: row.premium_until } }
  } catch (e) {
    return { ok: false, error: billingError(e) }
  }
}
