import type { Metadata } from 'next'
import { CoachOps } from '@/components/admin/CoachOps'

export const metadata: Metadata = { title: 'Coaches' }

export default function CoachesPage() {
  return <CoachOps />
}
