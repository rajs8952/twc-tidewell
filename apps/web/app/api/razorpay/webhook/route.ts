import { NextResponse } from 'next/server'
import { periodOfPlan, paidUntil, verifyWebhook, type RazorpaySubscription } from '@/lib/razorpay'
import { supabaseAdmin } from '@/lib/supabase/admin'

/*
 * Razorpay webhook: keeps Premium in step with the subscription after
 * checkout (renewals, failed payments, cancellations). Add it in Razorpay
 * → Settings → Webhooks: URL https://omniwell-app.vercel.app/api/razorpay/webhook,
 * events subscription.*, and a secret saved in Vercel as RAZORPAY_WEBHOOK_SECRET.
 *
 * Every request must carry a valid signature; anything else is refused.
 * Updates are idempotent, so Razorpay's retries are harmless.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const raw = await request.text()
  if (!verifyWebhook(raw, request.headers.get('x-razorpay-signature'))) return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 })

  const event = JSON.parse(raw) as { event: string; payload?: { subscription?: { entity?: RazorpaySubscription } } }
  const sub = event.payload?.subscription?.entity
  if (!event.event.startsWith('subscription.') || !sub) return NextResponse.json({ ignored: event.event })

  const admin = supabaseAdmin()
  if (!admin) return NextResponse.json({ error: 'Server not configured.' }, { status: 500 })

  // Whose subscription: the user id we put in its notes, else the one we stored at checkout.
  const notes = Array.isArray(sub.notes) ? {} : sub.notes
  let userId: string | undefined = notes.user_id
  if (!userId) {
    const { data } = await admin.from('subscriptions').select('user_id').eq('provider_subscription_id', sub.id).maybeSingle<{ user_id: string }>()
    userId = data?.user_id
  }
  if (!userId) return NextResponse.json({ ignored: 'unknown subscription' })

  const period = periodOfPlan(sub.plan_id)
  const now = new Date().toISOString()
  let change: Record<string, unknown> | null = null
  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      if (!period) break
      if (event.event === 'subscription.charged') {
        // Safety net: a renewal charged after the member cancelled in OmniWell needs a refund.
        const { data: mine } = await admin.from('subscriptions').select('cancel_at_period_end').eq('user_id', userId).maybeSingle<{ cancel_at_period_end: boolean }>()
        if (mine?.cancel_at_period_end) {
          console.error(`[razorpay webhook] REFUND CHECK: ${sub.id} was charged after its renewal was cancelled in OmniWell (user ${userId}).`)
          break // keep their cancelled plan as it is
        }
      }
      change = { plan: 'premium', source: 'paid', billing_period: period, premium_until: paidUntil(sub, period), status: 'active', cancel_at_period_end: false }
      break
    case 'subscription.pending':
      change = { status: 'past_due' } // a renewal payment failed; Razorpay retries, Premium continues meanwhile
      break
    case 'subscription.halted':
      change = { status: 'halted' } // retries exhausted: Premium stops
      break
    case 'subscription.cancelled':
    case 'subscription.completed':
      change = { status: 'cancelled', cancel_at_period_end: true } // Premium continues until the paid period ends
      break
  }
  if (change) {
    const { error } = await admin
      .from('subscriptions')
      .update({ ...change, provider: 'razorpay', provider_subscription_id: sub.id, updated_at: now })
      .eq('user_id', userId)
    if (error) {
      console.error('[razorpay webhook]', event.event, error.message)
      return NextResponse.json({ error: 'Couldn’t save.' }, { status: 500 }) // Razorpay retries
    }
    console.info(`[razorpay webhook] ${event.event} for ${userId}`)
  }
  return NextResponse.json({ ok: true })
}
