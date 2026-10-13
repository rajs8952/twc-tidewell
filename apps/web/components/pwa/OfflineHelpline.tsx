'use client'

import { useEffect, useState } from 'react'
import { cachedPlan } from '@/lib/usePlan'
import { cachedContacts } from '@/lib/useWellnessContacts'
import { EMERGENCY_NUMBER, WELLNESS_BY_ID, telHref } from '@/lib/wellness-team'

/**
 * The EAP number on the offline page. The page is saved at install time, so
 * it shows the details this device last loaded (admins can change them),
 * falling back to the defaults.
 */
export function OfflineHelpline() {
  const [line, setLine] = useState<{ label: string; phone: string | null }>({ label: 'the EAP', phone: WELLNESS_BY_ID.eap.phone })
  useEffect(() => {
    const saved = cachedContacts()
    // On the Free plan the EAP is Premium: show the emergency number instead.
    if (cachedPlan()?.premium === false) setLine({ label: 'emergency services', phone: saved?.emergency ?? EMERGENCY_NUMBER })
    else if (saved) setLine({ label: 'the EAP', phone: saved.byId.eap.phone })
  }, [])
  if (!line.phone) return null
  return (
    <p className="mt-5 text-xs text-muted">
      Need support now? Call {line.label} on{' '}
      <a href={telHref(line.phone)} className="font-bold text-ink underline underline-offset-2">
        {line.phone}
      </a>
      .
    </p>
  )
}
