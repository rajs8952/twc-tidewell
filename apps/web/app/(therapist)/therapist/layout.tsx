import type { Metadata } from 'next'
import { StaffPortalShell } from '@/components/therapist/StaffPortalShell'

export const metadata: Metadata = { title: 'Therapist portal', robots: { index: false } }

// Per request: who's signed in decides what renders.
export const dynamic = 'force-dynamic'

export default function TherapistLayout({ children }: { children: React.ReactNode }) {
  return <StaffPortalShell team="therapist">{children}</StaffPortalShell>
}
