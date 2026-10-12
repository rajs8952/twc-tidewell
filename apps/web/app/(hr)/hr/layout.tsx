import type { Metadata } from 'next'
import { HrShell } from '@/components/hr/HrShell'

export const metadata: Metadata = { title: { default: 'Company insights', template: '%s · Company insights' }, robots: { index: false } }

export default function HrLayout({ children }: { children: React.ReactNode }) {
  return <HrShell>{children}</HrShell>
}
