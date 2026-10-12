import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProgrammeView } from '@/components/programmes/ProgrammeView'
import { PROGRAMMES, PROGRAMME_BY_ID } from '@/lib/content/programmes'

export function generateStaticParams() {
  return PROGRAMMES.map((p) => ({ id: p.id }))
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  return { title: PROGRAMME_BY_ID[params.id]?.title ?? 'Programme' }
}

export default function ProgrammePage({ params }: { params: { id: string } }) {
  const programme = PROGRAMME_BY_ID[params.id]
  if (!programme) notFound()
  return <ProgrammeView programme={programme} />
}
