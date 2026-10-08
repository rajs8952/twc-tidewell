import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SecureInbox } from '@/components/messages/SecureInbox'
import { TEAMS, isTeam } from '@/lib/messages'

export const dynamicParams = false
export const generateStaticParams = () => Object.keys(TEAMS).map((team) => ({ team }))

export function generateMetadata({ params }: { params: { team: string } }): Metadata {
  return { title: isTeam(params.team) ? `Talk to ${TEAMS[params.team].label}` : 'Messages' }
}

/**
 * The secure inbox, opened on one team's chat: /messages/therapist or
 * /messages/dietitian. The chat window fills the page like WhatsApp Web,
 * with both teams' conversations in its list.
 */
export default function TeamMessagesPage({ params }: { params: { team: string } }) {
  if (!isTeam(params.team)) notFound()
  return (
    <>
      <h1 className="sr-only">Talk to {TEAMS[params.team].label}</h1>
      <SecureInbox key={params.team} team={params.team} />
    </>
  )
}
