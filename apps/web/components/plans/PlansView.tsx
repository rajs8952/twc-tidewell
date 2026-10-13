'use client'

import { Check, Crown, Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { cancelRenewal, confirmPayment, startCheckout } from '@/app/actions/billing'
import { PaymentDialog, type PaymentResult } from '@/components/plans/PaymentDialog'
import { payWithRazorpay } from '@/components/plans/useRazorpay'
import { PageHeader } from '@/components/PageHeader'
import { FREE_FEATURES, PREMIUM_FEATURES, PRICES, TRIAL_DAYS, daysLeft, type BillingPeriod, type PlanInfo } from '@/lib/plans'
import { refreshPlan, usePlan } from '@/lib/usePlan'

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** One line about the person's current plan. */
export function planSummary(p: PlanInfo): { title: string; detail: string } {
  if (p.staff) return { title: 'Premium', detail: 'Included with your coach, HR or admin role.' }
  if (!p.premium) return { title: 'Free', detail: p.source === 'trial' ? 'Your Premium trial has ended. Your entries are all still here.' : 'The six trackers, goals, streaks and the emergency number.' }
  switch (p.source) {
    case 'trial': {
      const d = daysLeft(p.premium_until)
      return { title: 'Premium trial', detail: `${d} ${d === 1 ? 'day' : 'days'} left, until ${longDate(p.premium_until!)}.` }
    }
    case 'company':
      return { title: 'Premium', detail: 'Provided by your company.' }
    case 'grandfathered':
      return { title: 'Premium', detail: 'Included free for early members. Thank you for being one.' }
    case 'admin':
      return { title: 'Premium', detail: 'Given to you by an OmniWell administrator.' }
    case 'paid':
      return {
        title: 'Premium',
        detail: p.premium_until ? `${p.cancel_at_period_end ? 'Ends' : 'Renews'} on ${longDate(p.premium_until)}${p.billing_period ? `, ${p.billing_period}` : ''}.` : 'Active.',
      }
    default:
      return { title: 'Premium', detail: '' }
  }
}

export function PlansView() {
  const plan = usePlan()
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const price = PRICES[period]
  const summary = plan ? planSummary(plan) : null
  const needsUpgrade = !!plan && !plan.staff && (!plan.premium || plan.source === 'trial' || (plan.source === 'paid' && plan.status === 'halted'))
  const paid = !!plan && plan.premium && plan.source === 'paid'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [result, setResult] = useState<PaymentResult | null>(null)

  async function upgrade() {
    setBusy(true)
    setError(null)
    setDone(null)
    let paid = false // once Razorpay says "paid", any later problem is about confirming, not paying
    try {
      const start = await startCheckout(period)
      if (!start.ok) return setResult({ kind: 'not-started', reason: start.error })
      let outcome
      try {
        outcome = await payWithRazorpay({ ...start.data, description: `Premium, ${price.label} a ${price.per}` })
      } catch (e) {
        return setResult({ kind: 'not-started', reason: e instanceof Error ? e.message : 'The payment page didn’t open.' })
      }
      if (outcome.status === 'closed') return setResult({ kind: 'closed' })
      if (outcome.status === 'failed') return setResult({ kind: 'failed', reason: outcome.reason })
      paid = true
      const res = await confirmPayment(outcome.proof)
      if (!res.ok) return setResult({ kind: 'unconfirmed', reason: res.error })
      await refreshPlan()
      setResult({ kind: 'success', detail: `Your plan renews on ${longDate(res.data.premiumUntil)}.${start.data.testMode ? ' (Test mode: no real money was taken.)' : ''}` })
    } catch (e) {
      const reason = e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'The connection dropped.'
      setResult(paid ? { kind: 'unconfirmed', reason: `${reason} We couldn’t finish confirming your payment.` } : { kind: 'not-started', reason })
    } finally {
      setBusy(false)
    }
  }

  async function cancel() {
    if (!window.confirm('Stop renewing Premium? You keep Premium until the end of the period you’ve paid for.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await cancelRenewal()
      if (!res.ok) return setError(res.error)
      await refreshPlan() // the button stays disabled until the page shows "Renewal is off"
      setDone(res.data.premiumUntil ? `Renewal cancelled. You keep Premium until ${longDate(res.data.premiumUntil)}.` : 'Renewal cancelled.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Plans" description="Everything you need to build healthy habits, with real support when you want it." icon={Crown} accent="#B9650E" />

      {summary && (
        <section aria-label="Your plan" className="mb-6 flex items-center gap-3 rounded-3xl bg-white p-5 ring-1 ring-line">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${plan?.premium ? 'bg-[#B9650E] text-white' : 'bg-mist text-ink'}`}>
            <Crown className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Your plan</p>
            <p className="font-display text-xl font-extrabold">{summary.title}</p>
            {summary.detail && <p className="text-sm text-muted">{summary.detail}</p>}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="free-title" className="rounded-3xl bg-white p-6 ring-1 ring-line">
          <h2 id="free-title" className="text-xl font-extrabold">
            Free
          </h2>
          <p className="mt-1 font-display text-3xl font-extrabold">₹0</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> {f}
              </li>
            ))}
            {PREMIUM_FEATURES.map((f) => (
              <li key={f.key} className="flex gap-2 text-muted">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {f.title}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="premium-title" className="relative rounded-3xl bg-gradient-to-br from-[#FFF7E6] to-white p-6 ring-2 ring-[#E9A21F]">
          <h2 id="premium-title" className="flex items-center gap-2 text-xl font-extrabold">
            <Crown className="h-5 w-5 text-[#B9650E]" aria-hidden /> Premium
          </h2>
          <div role="radiogroup" aria-label="Billing" className="mt-3 inline-flex rounded-full bg-white p-1 ring-1 ring-line">
            {(['monthly', 'yearly'] as BillingPeriod[]).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={period === p}
                onClick={() => setPeriod(p)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${period === p ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
              >
                {p === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
          <p className="mt-3 font-display text-3xl font-extrabold">
            {price.label}
            <span className="text-base font-bold text-muted"> / {price.per}</span>
          </p>
          <p className="text-sm text-muted">{period === 'yearly' ? `${PRICES.yearly.note}. ` : ''}Taxes included.</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex gap-2 font-semibold">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden /> Everything in Free, plus:
            </li>
            {PREMIUM_FEATURES.map((f) => (
              <li key={f.key} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1F6E64]" strokeWidth={3} aria-hidden />
                <span>
                  <b>{f.title}</b>
                  <span className="block text-muted">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
          {needsUpgrade ? (
            <>
              <button type="button" onClick={upgrade} disabled={busy} className="btn-primary mt-6 w-full py-3.5">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Crown className="h-4 w-4" aria-hidden />} Upgrade for {price.label} / {price.per}
              </button>
              <p className="mt-2 text-center text-xs text-muted">Secure payment by Razorpay: UPI, cards or netbanking. Cancel any time.</p>
            </>
          ) : paid ? (
            <div className="mt-6 rounded-2xl bg-white px-4 py-3 text-center text-sm ring-1 ring-line">
              <p className="font-bold">You have Premium{plan?.billing_period ? `, paid ${plan.billing_period}` : ''}.</p>
              {plan?.cancel_at_period_end ? (
                <p className="mt-1 text-muted">Renewal is off. Premium continues until {plan.premium_until ? longDate(plan.premium_until) : 'the end of the period'}.</p>
              ) : (
                <button type="button" onClick={cancel} disabled={busy} className="mt-2 text-sm font-bold text-muted underline underline-offset-2 hover:text-ink">
                  Cancel renewal
                </button>
              )}
            </div>
          ) : (
            plan?.premium && <p className="mt-6 rounded-2xl bg-white px-4 py-3 text-center text-sm font-bold ring-1 ring-line">You have Premium.</p>
          )}
          {error && (
            <p role="alert" className="notice-error mt-3">
              {error}
            </p>
          )}
          {done && (
            <p role="status" className="notice-ok mt-3">
              {done}
            </p>
          )}
        </section>
      </div>

      <PaymentDialog result={result} onClose={() => setResult(null)} onRetry={upgrade} />

      <p className="mt-6 text-xs text-muted">
        New accounts get {TRIAL_DAYS} days of Premium free. People whose company provides OmniWell have Premium included. In an emergency, call 112: it’s always available, on
        every plan.
      </p>
    </>
  )
}
