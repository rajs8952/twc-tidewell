import type { Metadata } from 'next'
import { ProgrammesView } from '@/components/programmes/ProgrammesView'

export const metadata: Metadata = { title: 'Programmes' }

export default function ProgrammesPage() {
  return <ProgrammesView />
}
