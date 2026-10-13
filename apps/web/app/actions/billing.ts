'use server'

import type { ActionResult } from '@rajs8952/core/types'
import type { BillingPeriod } from '@/lib/plans'
import { RazorpayNotConfigured, cancelSubscription, createSubscription, fetchSubscription, paidUntil, periodOfPlan, razorpayConfig, verifyCheckout } from '@/lib/razorpay'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'
import { supabaseAdmin } from '@/lib/supabase/admin'

/*
 * Premium payments (Razorpay Subscriptions):
 *   startCheckout   creates a subscription for the signed-in person; the browser opens Razorpay Checkout for it
 *   confirmPayment  checks Checkout's signature and turns Premium on until the end of the paid period
 *   cancelRenewal   stops the subscription on Razorpay now; Premium continues until the paid period ends
 * Renewals, failed payments and cancellations made elsewhere arrive at /api/razorpay/webhook.
 * Plans are written with the service role: people can't change their own plan (supabase/subscriptions.sql).
 */

type Row = { source: string; plan: string; premium_until: string | null; provider_subscription_id: string | null; status: string }

const friendly = (e: unknown) => (e instanceof RazorpayNotConfigured ? e.message : `Payment service: ${(e as Error).message}`)

async function context() {
  const session = await signedIn()
  if (!session) return { error: SIGNED_OUT }
  const admin = supabaseAdmin()
  if (!admin) return { error: 'The payment service isn’t configured on the server (SUPABASE_SERVICE_ROLE_KEY).' }
  const { data: role } = await session.supabase.rpc('my_role')
  const { data: row } = await admin.from('subscriptions').select('source, plan, premium_until, provider_subscription_id, status').eq('user_id', session.userId).maybeSingle<Row>()
  return { session, admin, staff: role === 'coach' || role === 'admin' || role === 'hr', row }
}

export async function startCheckout(period: BillingPeriod): Promise<ActionResult<{ keyId: string; subscriptionId: string; email: string; name: string; testMode: boolean }>> {
  if (period !== 'monthly' && period !== 'yearly') return { ok: false, error: 'Choose monthly or yearly.' }
  const ctx = await context()
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { session, admin, staff, row } = ctx
  // Premium that doesn't need paying for: staff, company, early members, admin grants, or an active paid plan.
  if (staff || (row && ['company', 'grandfathered', 'admin'].includes(row.source) && row.plan === 'premium')) return { ok: false, error: 'You already have Premium; there’s nothing to pay.' }
  if (row?.source === 'paid' && row.status === 'active' && row.premium_until && Date.parse(row.premium_until) > Date.now()) return { ok: false, error: 'You already have a paid Premium plan.' }
  try {
    const { keyId, testMode } = razorpayConfig()
    const sub = await createSubscription(period, session.userId)
    // Remember it, so only this person can confirm it.
    const { error } = await admin.from('subscriptions').upsert({ user_id: session.userId, provider: 'razorpay', provider_subscription_id: sub.id, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return { ok: false, error: `Couldn’t start the payment: ${error.message}` }
    const { data: profile } = await session.supabase.from('profiles').select('full_name').eq('id', session.userId).maybeSingle<{ full_name: string }>()
    const { data: user } = await session.supabase.auth.getUser()
    return { ok: true, data: { keyId, subscriptionId: sub.id, email: user.user?.email ?? '', name: profile?.full_name ?? '', testMode } }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

export async function confirmPayment(p: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }): Promise<ActionResult<{ premiumUntil: string }>> {
  const ctx = await context()
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { session, admin, row } = ctx
  if (!p?.razorpay_payment_id || !p.razorpay_subscription_id || !p.razorpay_signature) return { ok: false, error: 'The payment details are incomplete.' }
  try {
    if (!verifyCheckout(p.razorpay_payment_id, p.razorpay_subscription_id, p.razorpay_signature)) return { ok: false, error: 'We couldn’t verify that payment. If you were charged, it will be sorted out automatically.' }
    if (row?.provider_subscription_id !== p.razorpay_subscription_id) return { ok: false, error: 'That payment belongs to a different checkout.' }
    const sub = await fetchSubscription(p.razorpay_subscription_id)
    const notes = Array.isArray(sub.notes) ? {} : sub.notes
    if (notes.user_id !== session.userId) return { ok: false, error: 'That payment belongs to a different account.' }
    const period = periodOfPlan(sub.plan_id)
    if (!period) return { ok: false, error: 'That payment is for an unknown plan.' }
    const premiumUntil = paidUntil(sub, period)
    const { error } = await admin
      .from('subscriptions')
      .update({ plan: 'premium', source: 'paid', billing_period: period, premium_until: premiumUntil, status: 'active', cancel_at_period_end: false, provider: 'razorpay', provider_customer_id: sub.customer_id, updated_at: new Date().toISOString() })
      .eq('user_id', session.userId)
    if (error) return { ok: false, error: `Payment received, but saving your plan failed: ${error.message}. It will be fixed automatically.` }
    console.info(`[billing] premium ${period} for ${session.userId} via ${sub.id}`)
    return { ok: true, data: { premiumUntil } }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}

export async function cancelRenewal(): Promise<ActionResult<{ premiumUntil: string | null }>> {
  const ctx = await context()
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { session, admin, row } = ctx
  if (row?.source !== 'paid' || !row.provider_subscription_id) return { ok: false, error: 'There’s no paid plan to cancel.' }
  try {
    // Stopped on Razorpay now (no more charges); Premium continues here until premium_until.
    await cancelSubscription(row.provider_subscription_id)
    const { error } = await admin.from('subscriptions').update({ status: 'cancelled', cancel_at_period_end: true, updated_at: new Date().toISOString() }).eq('user_id', session.userId)
    if (error) return { ok: false, error: error.message }
    console.info(`[billing] renewal cancelled for ${session.userId}`)
    return { ok: true, data: { premiumUntil: row.premium_until } }
  } catch (e) {
    return { ok: false, error: friendly(e) }
  }
}
