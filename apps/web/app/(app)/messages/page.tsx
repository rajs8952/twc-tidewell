import type { Metadata } from 'next'
import { SecureInbox } from '@/components/messages/SecureInbox'

export const metadata: Metadata = { title: 'Chats' }

/**
 * The Chats tab: all of the employee's conversations with the therapist and
 * dietitian teams (ongoing and closed), and where to start a new one.
 */
export default function MessagesPage() {
  return (
    <>
      <h1 className="sr-only">Chats</h1>
      <SecureInbox />
    </>
  )
}
