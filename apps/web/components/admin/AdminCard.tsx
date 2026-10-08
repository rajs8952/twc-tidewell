'use client'

import { ChevronRight, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useMyRole } from '@/lib/useMyRole'

/** On Profile, for admins only: the way into the admin portal (also in the sidebar on larger screens). */
export function AdminCard() {
  const role = useMyRole()
  if (role !== 'admin') return null
  return (
    <Link href="/admin" className="flex items-center gap-3 rounded-3xl bg-ink p-5 text-white transition hover:bg-ink/90">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/15">
        <ShieldCheck className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-extrabold leading-tight">Admin portal</span>
        <span className="block text-sm text-white/80">Add users, assign roles and manage access.</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
    </Link>
  )
}
