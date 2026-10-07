import type { Metadata } from 'next'
import { StaffPortalShell } from '@/components/therapist/StaffPortalShell'

export const metadata: Metadata = { title: 'Dietitian portal', robots: { index: false } }

// Per request: who's signed in decides what renders.
export const dynamic = 'force-dynamic'

export default function DietitianLayout({ children }: { children: React.ReactNode }) {
  return <StaffPortalShell team="dietitian">{children}</StaffPortalShell>
}
