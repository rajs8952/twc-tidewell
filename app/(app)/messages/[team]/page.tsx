import type { Metadata } from 'next'
import { MessageCircleHeart } from 'lucide-react'
import { notFound } from 'next/navigation'
import { PageHeader } from '@/components/PageHeader'
import { SecureInbox } from '@/components/messages/SecureInbox'
import { TEAMS, isTeam } from '@/lib/messages'

export const dynamicParams = false
export const generateStaticParams = () => Object.keys(TEAMS).map((team) => ({ team }))

export function generateMetadata({ params }: { params: { team: string } }): Metadata {
  return { title: isTeam(params.team) ? `Talk to ${TEAMS[params.team].label}` : 'Messages' }
}

/** One inbox per wellness team: /messages/therapist and /messages/dietitian. */
export default function TeamMessagesPage({ params }: { params: { team: string } }) {
  if (!isTeam(params.team)) notFound()
  const info = TEAMS[params.team]
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Talk to ${info.label}`}
        description={`Write to a ${info.label.toLowerCase()} from your company’s wellness team.`}
        icon={MessageCircleHeart}
        accent={info.accent}
      />
      <SecureInbox key={params.team} team={params.team} />
    </div>
  )
}
