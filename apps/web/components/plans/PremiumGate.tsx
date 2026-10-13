'use client'

import { Crown, Loader2 } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { PREMIUM_FEATURES, PRICES, TRIAL_DAYS, type PremiumFeature } from '@/lib/plans'
import { usePlan } from '@/lib/usePlan'

/** The "part of Premium" card shown instead of a locked feature. */
export function PremiumCard({ feature, compact = false }: { feature: PremiumFeature; compact?: boolean }) {
  const plan = usePlan()
  const f = PREMIUM_FEATURES.find((x) => x.key === feature)!
  const canTrial = plan ? !plan.trial_used : false
  return (
    <section className={`rounded-3xl bg-gradient-to-br from-[#FFF7E6] to-white ring-1 ring-[#F2D3A8] ${compact ? 'p-4' : 'p-6'}`} aria-label={`${f.title} is part of Premium`}>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-[#B9650E] px-2.5 py-1 text-xs font-bold text-white">
        <Crown className="h-3.5 w-3.5" aria-hidden /> Premium
      </p>
      <h2 className={`mt-3 font-extrabold ${compact ? 'text-lg' : 'text-2xl'}`}>{f.title}</h2>
      <p className="mt-1 text-sm text-ink/80">{f.text}</p>
      <p className="mt-3 text-sm text-muted">
        Premium is {PRICES.monthly.label} a {PRICES.monthly.per}, or {PRICES.yearly.label} a {PRICES.yearly.per}, taxes included.
        {canTrial ? ` Try it free for ${TRIAL_DAYS} days.` : ''}
      </p>
      <Link href="/plans" className="btn-primary mt-4">
        <Crown className="h-4 w-4" aria-hidden /> {canTrial ? 'Start free trial' : 'See Premium'}
      </Link>
    </section>
  )
}

/**
 * Shows `children` with Premium, the Premium card without. While the plan is
 * still loading (first visit on a device) it shows a small placeholder, so a
 * Premium member never sees the lock flash.
 */
export function PremiumGate({ feature, children, fallback }: { feature: PremiumFeature; children: ReactNode; fallback?: ReactNode }) {
  const plan = usePlan()
  if (!plan)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </p>
    )
  if (plan.premium) return <>{children}</>
  return <>{fallback ?? <PremiumCard feature={feature} />}</>
}
