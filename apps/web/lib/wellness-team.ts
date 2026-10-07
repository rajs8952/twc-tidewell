import type { ContactRole } from '@rajs8952/interventions'
import { Apple, HeartHandshake, MessageCircleHeart, type LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------
 * The company's in-house wellness team, shown on the Profile page.
 *
 * Fill in the real contact details below. A contact left as null is
 * shown as "Details coming soon" instead of a link, so nothing fake
 * ever reaches employees.
 * ------------------------------------------------------------------ */

export interface WellnessContact {
  id: ContactRole
  name: string
  description: string
  icon: LucideIcon
  accent: string
  /** Shown as written; dialled as digits only, e.g. '+91 80 1234 5678'. */
  phone: string | null
  email: string | null
  /** Booking page or intranet link. */
  url: string | null
  hours: string | null
}

export const WELLNESS_TEAM: WellnessContact[] = [
  {
    id: 'eap',
    name: 'Employee Assistance Programme',
    description: 'Support with work, family, money or legal worries.',
    icon: HeartHandshake,
    accent: '#2E9C8F',
    phone: '+91 98751 08108',
    email: 'eap@thewellnesscorner.com',
    url: null,
    hours: null,
  },
  {
    id: 'therapist',
    name: 'Therapist',
    description: 'One-to-one sessions for stress, anxiety, low mood or burnout.',
    icon: MessageCircleHeart,
    accent: '#7C6BD6',
    phone: '+91 98751 08108',
    email: 'eap@thewellnesscorner.com',
    url: null,
    hours: null,
  },
  {
    id: 'dietitian',
    name: 'Dietitian',
    description: 'Personal advice on eating, energy and healthy weight.',
    icon: Apple,
    accent: '#E9851F',
    phone: null,
    email: 'dietitian@thewellnesscorner.com',
    url: null,
    hours: null,
  },
]

/**
 * The local emergency number (e.g. '112' in India and the EU, '911' in the US).
 * Shown in the crisis alert; null shows "your local emergency number" instead.
 */
export const EMERGENCY_NUMBER: string | null = '112'

export const WELLNESS_BY_ID = Object.fromEntries(WELLNESS_TEAM.map((c) => [c.id, c])) as Record<WellnessContact['id'], WellnessContact>

/** Teams with a secure inbox (app/(app)/messages/[team]); kept in step with TEAMS in lib/messages.ts. */
const SECURE_INBOX = { therapist: '/messages/therapist', dietitian: '/messages/dietitian' } as const

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

/**
 * Where a call-to-action should go, in order of what suits it best:
 * call → phone; chat/book → the team's secure in-app inbox (therapist and
 * dietitian), else a booking link, then email, then phone.
 * Null when the contact has no details yet.
 */
export function contactHref(id: WellnessContact['id'], kind: 'call' | 'chat' | 'book'): string | null {
  if (kind !== 'call' && id in SECURE_INBOX) return SECURE_INBOX[id as keyof typeof SECURE_INBOX]
  const c = WELLNESS_BY_ID[id]
  const phone = c.phone ? telHref(c.phone) : null
  const email = c.email ? `mailto:${c.email}` : null
  return kind === 'call' ? phone : (c.url ?? email ?? phone)
}
