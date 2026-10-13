import type { ContactRole } from '@rajs8952/interventions'
import { Apple, HeartHandshake, MessageCircleHeart, type LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------
 * The company's wellness team: EAP, therapist and dietitian, plus the
 * emergency number. Admins edit the details in the admin portal
 * (/admin/contacts, saved in supabase/wellness-contacts.sql); the app reads
 * them with lib/useWellnessContacts.ts. The values below are the defaults,
 * used before that SQL is run, while loading, and offline.
 *
 * A detail left as null is shown as "Details coming soon" instead of a
 * link, so nothing fake ever reaches employees.
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

/* ---------- Editable details ---------- */

export type ContactId = WellnessContact['id'] | 'emergency'

/** A row of public.wellness_contacts. */
export interface ContactRow {
  id: ContactId
  name: string
  description: string
  phone: string | null
  email: string | null
  url: string | null
  hours: string | null
}

export const CONTACT_COLUMNS = 'id, name, description, phone, email, url, hours'

/** Everything the screens need: the three contacts (with icons and colours) and the emergency number. */
export interface Contacts {
  team: WellnessContact[]
  byId: Record<WellnessContact['id'], WellnessContact>
  emergency: string | null
  /** Free plan: the EAP, therapist and dietitian are Premium; only the emergency number is shown. */
  locked?: boolean
}

/** The same contacts with the wellness team's details removed (Free plan). */
export function lockContacts(c: Contacts): Contacts {
  const team = c.team.map((t) => ({ ...t, phone: null, email: null, url: null, hours: null }))
  return { team, byId: Object.fromEntries(team.map((t) => [t.id, t])) as Contacts['byId'], emergency: c.emergency, locked: true }
}

export const DEFAULT_CONTACTS: Contacts = { team: WELLNESS_TEAM, byId: WELLNESS_BY_ID, emergency: EMERGENCY_NUMBER }

/** Saved details over the defaults (icons and colours always come from the defaults). */
export function contactsFrom(rows: ContactRow[]): Contacts {
  const saved = new Map(rows.map((r) => [r.id, r]))
  const team = WELLNESS_TEAM.map((c) => {
    const r = saved.get(c.id)
    return r ? { ...c, name: r.name, description: r.description, phone: r.phone, email: r.email, url: r.url, hours: r.hours } : c
  })
  const emergency = saved.has('emergency') ? (saved.get('emergency')!.phone ?? null) : EMERGENCY_NUMBER
  return { team, byId: Object.fromEntries(team.map((c) => [c.id, c])) as Contacts['byId'], emergency }
}

/** The editable fields of one contact, as typed in the admin form. */
export type ContactInput = Pick<ContactRow, 'name' | 'description' | 'phone' | 'email' | 'url' | 'hours'>

const PHONE = /^\+?[0-9][0-9 ()-]{1,24}$/
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Trims and checks one contact; mirrors the CHECK constraints in supabase/wellness-contacts.sql. */
export function validateContact(id: ContactId, input: ContactInput): { ok: true; value: ContactInput } | { ok: false; error: string } {
  const t = (v: string | null | undefined) => (v ?? '').trim()
  const orNull = (v: string) => (v ? v : null)
  const value: ContactInput = {
    name: t(input.name),
    description: t(input.description),
    phone: orNull(t(input.phone)),
    email: orNull(t(input.email).toLowerCase()),
    url: orNull(t(input.url)),
    hours: orNull(t(input.hours)),
  }
  const label = id === 'emergency' ? 'The emergency number' : value.name || 'This contact'
  if (!value.name || value.name.length > 80) return { ok: false, error: 'Give each contact a name of up to 80 characters.' }
  if (value.description.length > 200) return { ok: false, error: `${label}: keep the description under 200 characters.` }
  if (value.phone && !PHONE.test(value.phone)) return { ok: false, error: `${label}: enter the phone number with digits, spaces or dashes only, e.g. +91 80 1234 5678.` }
  if (id === 'emergency' && !value.phone) return { ok: false, error: 'Enter the emergency number (for example 112).' }
  if (value.email && (value.email.length > 254 || !EMAIL.test(value.email))) return { ok: false, error: `${label}: that email address doesn’t look right.` }
  if (value.url && (value.url.length > 300 || !/^https:\/\/[^\s]+\.[^\s]+/.test(value.url))) return { ok: false, error: `${label}: links must start with https://.` }
  if (value.hours && value.hours.length > 120) return { ok: false, error: `${label}: keep the hours under 120 characters.` }
  return { ok: true, value }
}

/** Teams with a secure inbox (app/(app)/messages/[team]); kept in step with TEAMS in lib/messages.ts. */
const SECURE_INBOX = { therapist: '/messages/therapist', dietitian: '/messages/dietitian' } as const

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

/**
 * Where a call-to-action should go, in order of what suits it best:
 * call → phone; chat/book → the team's secure in-app inbox (therapist and
 * dietitian), else a booking link, then email, then phone.
 * Null when the contact has no details yet.
 */
export function contactHref(id: WellnessContact['id'], kind: 'call' | 'chat' | 'book', contacts: Contacts = DEFAULT_CONTACTS): string | null {
  if (contacts.locked) return null // Premium (Free plan sees the emergency number only)
  if (kind !== 'call' && id in SECURE_INBOX) return SECURE_INBOX[id as keyof typeof SECURE_INBOX]
  const c = contacts.byId[id]
  const phone = c.phone ? telHref(c.phone) : null
  const email = c.email ? `mailto:${c.email}` : null
  return kind === 'call' ? phone : (c.url ?? email ?? phone)
}
