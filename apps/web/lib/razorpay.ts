import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { BillingPeriod } from '@/lib/plans'

/* ------------------------------------------------------------------
 * Razorpay Subscriptions (server only). Test mode until live keys are set.
 *
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET   API keys (Dashboard → Settings → API Keys)
 *   RAZORPAY_PLAN_MONTHLY                  plan id for ₹99 / month
 *   RAZORPAY_PLAN_YEARLY                   plan id for ₹599 / year
 *   RAZORPAY_WEBHOOK_SECRET                the secret entered when adding the webhook
 *
 * The secret key never leaves the server; the browser only gets the key id.
 * ------------------------------------------------------------------ */

const API = 'https://api.razorpay.com/v1'

export class RazorpayNotConfigured extends Error {}

export function razorpayConfig() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret, RAZORPAY_PLAN_MONTHLY: monthly, RAZORPAY_PLAN_YEARLY: yearly } = process.env
  if (!keyId || !keySecret || !monthly || !yearly) throw new RazorpayNotConfigured('Payments aren’t set up yet (Razorpay keys and plan ids).')
  return { keyId, keySecret, plans: { monthly, yearly } as Record<BillingPeriod, string>, testMode: keyId.startsWith('rzp_test_') }
}

/** Which period a Razorpay plan id is (null if it's neither of ours). */
export function periodOfPlan(planId: string | null | undefined): BillingPeriod | null {
  const { plans } = razorpayConfig()
  return planId === plans.monthly ? 'monthly' : planId === plans.yearly ? 'yearly' : null
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { keyId, keySecret } = razorpayConfig()
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } }
  if (!res.ok) throw new Error(json.error?.description ?? `Razorpay error ${res.status}`)
  return json
}

export interface RazorpaySubscription {
  id: string
  plan_id: string
  status: 'created' | 'authenticated' | 'active' | 'pending' | 'halted' | 'cancelled' | 'completed' | 'expired' | 'paused'
  current_start: number | null
  current_end: number | null
  customer_id: string | null
  notes: Record<string, string> | []
  /** Razorpay's own payment page for this subscription (the OmniWell app opens it). */
  short_url?: string | null
}

/** A new subscription for this person (they pay for it in Razorpay Checkout). */
export function createSubscription(period: BillingPeriod, userId: string) {
  const { plans } = razorpayConfig()
  return call<RazorpaySubscription>('/subscriptions', {
    method: 'POST',
    // total_count: how many times it can renew (10 years either way).
    body: { plan_id: plans[period], total_count: period === 'monthly' ? 120 : 10, customer_notify: 1, notes: { user_id: userId, period } },
  })
}

export const fetchSubscription = (id: string) => call<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(id)}`)

/**
 * Stops the subscription on Razorpay now, so nothing more is ever charged.
 * (Razorpay's "cancel at cycle end" didn't reliably register in testing.)
 * OmniWell keeps the member on Premium until the period they paid for ends
 * (subscriptions.premium_until; has_premium() allows status 'cancelled').
 */
export const cancelSubscription = (id: string) => call<RazorpaySubscription>(`/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { cancel_at_cycle_end: false } })

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Checkout's proof of payment: HMAC-SHA256(payment_id|subscription_id) with the key secret. */
export function verifyCheckout(paymentId: string, subscriptionId: string, signature: string) {
  const { keySecret } = razorpayConfig()
  return safeEqual(createHmac('sha256', keySecret).update(`${paymentId}|${subscriptionId}`).digest('hex'), signature)
}

/** A webhook's signature: HMAC-SHA256(raw body) with the webhook secret. */
export function verifyWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!secret || !signature) return false
  return safeEqual(createHmac('sha256', secret).update(rawBody).digest('hex'), signature)
}

/** When the paid period ends, from Razorpay (or, just after checkout, one period from now). */
export function paidUntil(sub: Pick<RazorpaySubscription, 'current_end'>, period: BillingPeriod) {
  if (sub.current_end) return new Date(sub.current_end * 1000).toISOString()
  const d = new Date()
  if (period === 'monthly') d.setMonth(d.getMonth() + 1)
  else d.setFullYear(d.getFullYear() + 1)
  return d.toISOString()
}
