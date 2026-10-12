import type { Metadata } from 'next'
import { ImportUsers } from '@/components/admin/ImportUsers'

export const metadata: Metadata = { title: 'Import people' }
// Each batch creates a few accounts and sends their invitations; give it time.
export const maxDuration = 60

export default function ImportPage() {
  return <ImportUsers />
}
