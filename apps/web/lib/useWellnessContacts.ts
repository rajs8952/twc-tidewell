'use client'

import { useEffect, useState } from 'react'
import { storageKey } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'
import { usePlan } from '@/lib/usePlan'
import { CONTACT_COLUMNS, DEFAULT_CONTACTS, contactsFrom, lockContacts, type ContactRow, type Contacts } from '@/lib/wellness-team'

/* ------------------------------------------------------------------
 * The wellness team's current details (supabase/wellness-contacts.sql),
 * loaded once per visit and shared by every screen. The last values are
 * also kept on the device, so the crisis prompt and the offline page have
 * the right numbers straight away, even without a connection. Before the
 * SQL is run (or signed out) the defaults in lib/wellness-team.ts apply.
 * ------------------------------------------------------------------ */

const CACHE_KEY = storageKey('wellness-contacts')

let current: Contacts | null = null
let loading: Promise<Contacts> | null = null
const listeners = new Set<(c: Contacts) => void>()

/** The details saved on this device last time, if any. */
export function cachedContacts(): Contacts | null {
  try {
    const rows = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as ContactRow[] | null
    return Array.isArray(rows) && rows.length ? contactsFrom(rows) : null
  } catch {
    return null
  }
}

/** Shares new details with every screen (after loading, or after an admin saves). */
export function publishContacts(rows: ContactRow[]) {
  current = contactsFrom(rows)
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  } catch {
    /* the defaults still apply */
  }
  listeners.forEach((l) => l(current!))
}

function load(): Promise<Contacts> {
  loading ??= (async () => {
    const { data, error } = await createClient().from('wellness_contacts').select(CONTACT_COLUMNS)
    if (!error && data?.length) publishContacts(data as ContactRow[])
    else loading = null // try again next time (e.g. after signing in, or once the SQL is run)
    return current ?? cachedContacts() ?? DEFAULT_CONTACTS
  })()
  return loading
}

/** The contacts to show: on the Free plan, only the emergency number (the EAP and coaches are Premium). */
export function useWellnessContacts(): Contacts {
  const plan = usePlan()
  const [contacts, setContacts] = useState<Contacts>(current ?? DEFAULT_CONTACTS)
  useEffect(() => {
    listeners.add(setContacts)
    if (!current) {
      const saved = cachedContacts()
      if (saved) setContacts(saved)
    }
    load().then(setContacts, () => undefined)
    return () => {
      listeners.delete(setContacts)
    }
  }, [])
  return plan && !plan.premium ? lockContacts(contacts) : contacts
}
