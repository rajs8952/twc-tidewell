import { redirect } from 'next/navigation'

/** The original therapist-only address; kept so old links still work. */
export default function MessagesPage() {
  redirect('/messages/therapist')
}
