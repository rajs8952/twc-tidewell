import type { Metadata } from 'next'
import { AdminShell } from '@/components/admin/AdminShell'

export const metadata: Metadata = { title: 'Admin', robots: { index: false } }

// Per request: who's signed in decides what renders.
export const dynamic = 'force-dynamic'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>
}
