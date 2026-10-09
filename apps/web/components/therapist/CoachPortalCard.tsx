'use client'

import { BriefcaseMedical, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { TEAMS } from '@/lib/messages'
import { useMyStaffTeam } from '@/lib/useMyStaffTeam'

/** On Profile, for coaches only: the way into their coach portal (also in the sidebar on larger screens). */
export function CoachPortalCard() {
  const team = useMyStaffTeam()
  if (!team) return null
  const info = TEAMS[team]
  return (
    <Link href={info.portalPath} className="flex items-center gap-3 rounded-3xl p-5 text-white transition hover:opacity-95" style={{ background: '#0F5C4E' }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <BriefcaseMedical className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-extrabold leading-tight">{info.label} portal</span>
        <span className="block text-sm text-white/80">Your conversations with employees, the pool and your profile.</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
    </Link>
  )
}
