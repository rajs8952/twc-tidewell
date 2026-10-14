import type { ContactRole } from '@rajs8952/interventions'
import { useFocusEffect } from 'expo-router'
import { Apple, HeartHandshake, MessageCircleHeart, type LucideIcon } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { usePlan } from './plan'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * The company's wellness team (EAP, therapist, dietitian) and the
 * emergency number. Admins edit the details on the website
 * (/admin/contacts → public.wellness_contacts); the values below are the
 * website's defaults (apps/web/lib/wellness-team.ts), used before that
 * loads. On the Free plan only the emergency number is shown, and the
 * database only returns that row.
 * ------------------------------------------------------------------ */

export interface WellnessContact {
  id: ContactRole
  name: string
  description: string
  icon: LucideIcon
  accent: string
  phone: string | null
  email: string | null
  url: string | null
  hours: string | null
}

const DEFAULT_TEAM: WellnessContact[] = [
  { id: 'eap', name: 'Employee Assistance Programme', description: 'Support with work, family, money or legal worries.', icon: HeartHandshake, accent: '#2E9C8F', phone: '+91 98751 08108', email: 'eap@thewellnesscorner.com', url: null, hours: null },
  { id: 'therapist', name: 'Therapist', description: 'One-to-one sessions for stress, anxiety, low mood or burnout.', icon: MessageCircleHeart, accent: '#7C6BD6', phone: '+91 98751 08108', email: 'eap@thewellnesscorner.com', url: null, hours: null },
  { id: 'dietitian', name: 'Dietitian', description: 'Personal advice on eating, energy and healthy weight.', icon: Apple, accent: '#E9851F', phone: null, email: 'dietitian@thewellnesscorner.com', url: null, hours: null },
]
const DEFAULT_EMERGENCY = '112'

export interface Contacts {
  team: WellnessContact[]
  byId: Record<ContactRole, WellnessContact>
  emergency: string | null
  /** Free plan: the wellness team's details are Premium. */
  locked: boolean
}

type Row = { id: ContactRole | 'emergency'; name: string; description: string; phone: string | null; email: string | null; url: string | null; hours: string | null }

function contactsFrom(rows: Row[], locked: boolean): Contacts {
  const saved = new Map(rows.map((r) => [r.id, r]))
  const team = DEFAULT_TEAM.map((c) => {
    const r = saved.get(c.id)
    const merged = r ? { ...c, name: r.name, description: r.description, phone: r.phone, email: r.email, url: r.url, hours: r.hours } : c
    return locked ? { ...merged, phone: null, email: null, url: null, hours: null } : merged
  })
  const emergency = saved.has('emergency') ? (saved.get('emergency')!.phone ?? null) : DEFAULT_EMERGENCY
  return { team, byId: Object.fromEntries(team.map((c) => [c.id, c])) as Contacts['byId'], emergency, locked }
}

let saved: Row[] = []

/** The contacts to show, re-read when the screen comes into view. */
export function useContacts(): Contacts {
  const plan = usePlan()
  const [rows, setRows] = useState<Row[]>(saved)
  useFocusEffect(
    useCallback(() => {
      let alive = true
      supabase
        .from('wellness_contacts')
        .select('id, name, description, phone, email, url, hours')
        .then(({ data, error }) => {
          if (!alive || error || !data) return
          saved = data as Row[]
          setRows(saved)
        })
      return () => {
        alive = false
      }
    }, []),
  )
  return contactsFrom(rows, !!plan && !plan.premium)
}

/** A phone number as a tel: link (digits and + only). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
