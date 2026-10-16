import { NextResponse } from 'next/server'
import { beginCheckout, stopRenewal, syncCheckout } from '@/lib/billing'
import { isJson, signedInFromBearer } from '@/lib/supabase/bearer'

/* ------------------------------------------------------------------
 * POST /api/mobile/billing: Premium from the OmniWell app.
 *   { action: 'checkout', period: 'monthly' | 'yearly' }
 *       a new Razorpay subscription for the signed-in person; returns the
 *       link to Razorpay's own payment page, which the app opens (card
 *       details are only ever typed on Razorpay's page)
 *   { action: 'sync' }    after the payment page closes: turns Premium on
 *       once Razorpay reports the subscription paid (the webhook does too)
 *   { action: 'cancel' }  stops the renewal; Premium lasts until the paid period ends
 * The same rules as the website's Plans page (lib/billing.ts).
 * ------------------------------------------------------------------ */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!isJson(req)) return NextResponse.json({ error: 'Send JSON.' }, { status: 415 })
  const payer = await signedInFromBearer(req)
  if (!payer) return NextResponse.json({ error: 'You’re signed out. Log in again to continue.' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as { action?: unknown; period?: unknown } | null

  switch (body?.action) {
    case 'checkout': {
      const period = body.period === 'monthly' || body.period === 'yearly' ? body.period : null
      if (!period) return NextResponse.json({ error: 'Choose monthly or yearly.' }, { status: 400 })
      const started = await beginCheckout(payer, period)
      if (!started.ok) return NextResponse.json({ error: started.error }, { status: 400 })
      const url = started.data.sub.short_url
      if (!url) return NextResponse.json({ error: 'Razorpay didn’t return a payment page. Please try again.' }, { status: 502 })
      return NextResponse.json({ url, testMode: started.data.testMode })
    }
    case 'sync': {
      const synced = await syncCheckout(payer)
      return synced.ok ? NextResponse.json(synced.data) : NextResponse.json({ error: synced.error }, { status: 400 })
    }
    case 'cancel': {
      const stopped = await stopRenewal(payer)
      return stopped.ok ? NextResponse.json(stopped.data) : NextResponse.json({ error: stopped.error }, { status: 400 })
    }
    default:
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }
}
