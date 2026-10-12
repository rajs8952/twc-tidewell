'use server'

import type { ActionResult } from '@rajs8952/core/types'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'
import { CONTACT_COLUMNS, validateContact, type ContactId, type ContactInput, type ContactRow } from '@/lib/wellness-team'

/*
 * Saves the wellness team's contact details (admin portal → Wellness contacts).
 * Checks the caller is an admin, validates every field, then writes with the
 * caller's own session, so the database's rule (only admins may update
 * supabase/wellness-contacts.sql) is enforced as well.
 */

const IDS: ContactId[] = ['eap', 'therapist', 'dietitian', 'emergency']

export async function saveWellnessContacts(input: (ContactInput & { id: ContactId })[]): Promise<ActionResult<ContactRow[]>> {
  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }
  const { data: isAdmin } = await session.supabase.rpc('is_admin')
  if (isAdmin !== true) return { ok: false, error: 'Only admins can change the wellness contacts.' }

  if (!Array.isArray(input) || input.length !== IDS.length || !IDS.every((id) => input.some((r) => r?.id === id))) {
    return { ok: false, error: 'Something’s missing from the form. Reload the page and try again.' }
  }
  const clean: (ContactInput & { id: ContactId })[] = []
  for (const id of IDS) {
    const parsed = validateContact(id, input.find((r) => r.id === id)!)
    if (!parsed.ok) return parsed
    clean.push({ id, ...parsed.value })
  }

  const saved: ContactRow[] = []
  const now = new Date().toISOString()
  for (const row of clean) {
    const { id, ...fields } = row
    const { data, error } = await session.supabase
      .from('wellness_contacts')
      .update({ ...fields, updated_at: now, updated_by: session.userId })
      .eq('id', id)
      .select(CONTACT_COLUMNS)
      .maybeSingle<ContactRow>()
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return { ok: false, error: 'Run supabase/wellness-contacts.sql in Supabase first.' }
      return { ok: false, error: error.code === '23514' ? 'One of the details isn’t in the right format.' : error.message }
    }
    if (!data) return { ok: false, error: 'Couldn’t save: run supabase/wellness-contacts.sql in Supabase first.' }
    saved.push(data)
  }
  console.info(`[admin] wellness contacts updated by ${session.userId}`)
  return { ok: true, data: saved }
}
