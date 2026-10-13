'use client'

import { ChevronRight, Crown } from 'lucide-react'
import Link from 'next/link'
import { planSummary } from '@/components/plans/PlansView'
import { usePlan } from '@/lib/usePlan'

/** On Profile: the current plan, linking to Plans. */
export function PlanCard() {
  const plan = usePlan()
  if (!plan) return null
  const s = planSummary(plan)
  return (
    <Link href="/plans" className="flex items-center gap-3 rounded-3xl bg-white p-5 ring-1 ring-line transition hover:ring-[#E9A21F]">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${plan.premium ? 'bg-[#B9650E] text-white' : 'bg-mist text-ink'}`}>
        <Crown className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold uppercase tracking-wide text-muted">Your plan</span>
        <span className="block text-lg font-extrabold leading-tight">{s.title}</span>
        <span className="block text-sm text-muted">{s.detail}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted" aria-hidden />
    </Link>
  )
}

/** On Home: a slim note during the trial's last days, or on Free. Nothing for Premium members. */
export function PlanBanner() {
  const plan = usePlan()
  if (!plan || plan.staff) return null
  const trialEnding = plan.premium && plan.source === 'trial'
  if (plan.premium && !trialEnding) return null
  const s = planSummary(plan)
  return (
    <Link
      href="/plans"
      className="mb-6 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-[#FFF7E6] to-white px-4 py-3 text-sm ring-1 ring-[#F2D3A8] transition hover:ring-[#E9A21F]"
    >
      <Crown className="h-5 w-5 shrink-0 text-[#B9650E]" aria-hidden />
      <span className="min-w-0 flex-1">
        <b>{trialEnding ? s.title : 'You’re on Free'}</b> · {trialEnding ? s.detail : 'Chat with coaches, reminders, insights and more come with Premium.'}
      </span>
      <span className="shrink-0 font-bold text-[#8A4B0A]">{trialEnding ? 'Keep Premium' : 'See Premium'}</span>
    </Link>
  )
}
