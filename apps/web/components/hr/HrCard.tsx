'use client'

import { BarChart3, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { canSeeHrDashboard } from '@/lib/admin'
import { useMyRole } from '@/lib/useMyRole'

/** On Profile, for HR and admins: the way into the company dashboard (also in the sidebar on larger screens). */
export function HrCard() {
  const role = useMyRole()
  if (!canSeeHrDashboard(role)) return null
  return (
    <Link href="/hr" className="flex items-center gap-3 rounded-3xl bg-[#1F6E64] p-5 text-white transition hover:bg-[#1F6E64]/90">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <BarChart3 className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-extrabold leading-tight">Company insights</span>
        <span className="block text-sm text-white/80">Anonymised adoption, wellbeing and support trends.</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
    </Link>
  )
}
