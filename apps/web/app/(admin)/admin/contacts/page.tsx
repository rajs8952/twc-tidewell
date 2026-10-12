import type { Metadata } from 'next'
import { ContactsEditor } from '@/components/admin/ContactsEditor'

export const metadata: Metadata = { title: 'Wellness contacts' }

export default function ContactsPage() {
  return <ContactsEditor />
}
