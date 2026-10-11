'use client'

import { Check, ChevronRight, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getNotificationSchedules } from '@/app/actions/notifications'
import { storageKey } from '@/lib/brand'
import { isStandalone } from '@/lib/pwa'

/** Shown for this long after sign-up, unless finished or dismissed sooner. */
const SHOW_FOR_DAYS = 14
const DISMISS_KEY = storageKey('first-week-dismissed')

interface Props {
  /** When the account was created (ISO). */
  createdAt: string | null | undefined
  /** Chose a focus on the welcome screen. */
  focusChosen: boolean
  /** Anything logged this week (any tracker). */
  loggedAnything: boolean
  /** A mood check-in this week. */
  checkedInMood: boolean
}

/**
 * Home's getting-started card for a new account's first two weeks: a few
 * small steps that make OmniWell useful (focus, first entry, mood check-in,
 * reminders, and optionally installing the app). Disappears when they're
 * done, after 14 days, or when dismissed (per device).
 */
export function FirstWeekChecklist({ createdAt, focusChosen, loggedAnything, checkedInMood }: Props) {
  const [dismissed, setDismissed] = useState(true)
  const [remindersOn, setRemindersOn] = useState<boolean | null>(null)
  const [installed, setInstalled] = useState(false)

  const recent = !!createdAt && Date.now() - Date.parse(createdAt) < SHOW_FOR_DAYS * 86_400_000

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
    setInstalled(isStandalone())
  }, [])

  useEffect(() => {
    if (!recent) return
    getNotificationSchedules()
      .then((r) => setRemindersOn(r.ok ? r.data.some((s) => s.is_enabled) : false))
      .catch(() => setRemindersOn(false))
  }, [recent])

  if (!recent || dismissed || remindersOn === null) return null

  const items = [
    { done: focusChosen, label: 'Choose what to focus on', href: '/welcome' },
    { done: loggedAnything, label: 'Log your first entry', href: '/water' },
    { done: checkedInMood, label: 'Check in on your mood', href: '/mood' },
    { done: remindersOn, label: 'Turn on a reminder', href: '/profile#reminders' },
  ]
  const doneCount = items.filter((i) => i.done).length
  if (doneCount === items.length) return null

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* per-device convenience only */
    }
  }

  return (
    <section aria-labelledby="first-week-title" className="mb-6 rounded-3xl bg-white p-5 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="first-week-title" className="text-lg font-bold">
            Your first week
          </h2>
          <p className="text-sm text-muted">
            {doneCount} of {items.length} done. A few small steps to make OmniWell yours.
          </p>
        </div>
        <button type="button" onClick={dismiss} className="-mr-1 rounded-full p-2 text-muted hover:bg-mist hover:text-ink" aria-label="Hide the first-week checklist">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-mist" aria-hidden>
        <div className="h-full rounded-full bg-[#0F7A6A] transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ul className="mt-3 divide-y divide-line">
        {items.map((i) => (
          <li key={i.label}>
            {i.done ? (
              <p className="flex items-center gap-3 py-2.5 text-sm text-muted">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
                <span className="line-through">{i.label}</span>
                <span className="sr-only">(done)</span>
              </p>
            ) : (
              <Link href={i.href} className="flex items-center gap-3 py-2.5 text-sm font-semibold hover:text-tide-600">
                <span className="h-6 w-6 rounded-full ring-2 ring-line" aria-hidden />
                <span className="flex-1">{i.label}</span>
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            )}
          </li>
        ))}
        {!installed && (
          <li>
            <Link href="/profile#install" className="flex items-center gap-3 py-2.5 text-sm text-muted hover:text-ink">
              <span className="h-6 w-6 rounded-full border-2 border-dashed border-line" aria-hidden />
              <span className="flex-1">Optional: install OmniWell on your phone</span>
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          </li>
        )}
      </ul>
    </section>
  )
}
