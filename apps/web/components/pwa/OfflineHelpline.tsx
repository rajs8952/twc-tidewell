'use client'

import { useEffect, useState } from 'react'
import { cachedContacts } from '@/lib/useWellnessContacts'
import { WELLNESS_BY_ID, telHref } from '@/lib/wellness-team'

/**
 * The EAP number on the offline page. The page is saved at install time, so
 * it shows the details this device last loaded (admins can change them),
 * falling back to the defaults.
 */
export function OfflineHelpline() {
  const [eap, setEap] = useState(WELLNESS_BY_ID.eap.phone)
  useEffect(() => {
    const saved = cachedContacts()
    if (saved) setEap(saved.byId.eap.phone)
  }, [])
  if (!eap) return null
  return (
    <p className="mt-5 text-xs text-muted">
      Need support now? Call the EAP on{' '}
      <a href={telHref(eap)} className="font-bold text-ink underline underline-offset-2">
        {eap}
      </a>
      .
    </p>
  )
}
