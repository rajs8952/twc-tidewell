import type { Metadata } from 'next'
import { HubView } from '@/components/hub/HubView'

export const metadata: Metadata = { title: 'Home' }

export default function DashboardPage() {
  return <HubView />
}
