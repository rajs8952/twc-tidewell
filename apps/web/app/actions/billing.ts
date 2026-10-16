'use server'

import type { ActionResult } from '@rajs8952/core/types'
import type { BillingPeriod } from '@/lib/plans'
import { beginCheckout, billingContext, billingError, stopRenewal } from '@/lib/billing'
import { fetchSubscription, paidUntil, periodOfPlan, verifyCheckout } from '@/lib/razorpay'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'

/*
 * Premium payments (Razorpay Subscriptions):
 *   startCheckout   creates a subscription for the signed-in person; the browser opens Razorpay Checkout for it
 *   confirmPayment  checks Checkout's signature and turns Premium on until the end of the paid period
 *   cancelRenewal   stops the subscription on Razorpay now; Premium continues until the paid period ends
 * Renewals, failed payments and cancellations made elsewhere arrive at /api/razorpay/webhook.
 * The shared steps live in lib/billing.ts (the OmniWell app uses them too, app/api/mobile/billing).
 */

export async function startCheckout(period: BillingPeriod): Promise<ActionResult<{ keyId: string; subscriptionId: string; email: string; name: string; testMode: boolean }>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const started = await beginCheckout(session, period)
  if (!started.ok) return started
  const { data: profile } = await session.supabase.from('profiles').select('full_name').eq('id', session.userId).maybeSingle<{ full_name: string }>()
  const { data: user } = await session.supabase.auth.getUser()
  return { ok: true, data: { keyId: started.data.keyId, subscriptionId: started.data.sub.id, email: user.user?.email ?? '', name: profile?.full_name ?? '', testMode: started.data.testMode } }
}

export async function confirmPayment(p: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }): Promise<ActionResult<{ premiumUntil: string }>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const ctx = await billingContext(session)
  if ('error' in ctx) return { ok: false, error: ctx.error! }
  const { admin, row } = ctx
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
    return { ok: false, error: billingError(e) }
  }
}

export async function cancelRenewal(): Promise<ActionResult<{ premiumUntil: string | null }>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  return stopRenewal(session)
}
