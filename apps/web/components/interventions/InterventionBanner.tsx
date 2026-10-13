'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, CalendarCheck, Lightbulb, LifeBuoy, MessageCircleHeart, Phone, PartyPopper, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Intervention, InterventionAction } from '@rajs8952/interventions'
import { useWellnessContacts } from '@/lib/useWellnessContacts'
import { contactHref, telHref } from '@/lib/wellness-team'

/* ------------------------------------------------------------------
 * Shows one intervention from lib/intervention-engine.ts:
 *  - CRITICAL: a high-contrast crisis dialog with the helpline. It has no
 *    close button and ignores Esc and backdrop clicks; it only closes
 *    through an explicit "I'm okay for now", so it can't be lost by accident
 *    but never traps someone who needs to leave.
 *  - WARNING / SUGGESTION / CHEER: a dismissible inline banner. Its button
 *    opens the right team's inbox ("Talk to Dietitian" / "Talk to Therapist")
 *    or, for 'open' actions, a page in the app ("Log water"). CHEER is
 *    good news and may have no button at all.
 *  - NORMAL: nothing.
 * ------------------------------------------------------------------ */

/** Where the wellness team is listed, for contacts that have no details yet. */
const TEAM_PAGE = '/dashboard#wellness-team'

const isExternal = (href: string) => /^https?:/.test(href)

export function InterventionBanner({ intervention, onDismiss }: { intervention: Intervention | null; onDismiss: () => void }) {
  if (!intervention || intervention.severity === 'NORMAL') return null
  if (intervention.severity === 'CRITICAL') return <CrisisDialog intervention={intervention} onAcknowledge={onDismiss} />
  return <InlineBanner intervention={intervention} onDismiss={onDismiss} />
}

/* ---------- WARNING / SUGGESTION ---------- */

const TONE = {
  WARNING: { label: 'Heads up', icon: TriangleAlert, box: 'bg-amber-50 ring-amber-200', icon_: 'bg-amber-100 text-amber-800', tag: 'text-amber-800' },
  SUGGESTION: { label: 'Suggestion', icon: Lightbulb, box: 'bg-tide-50 ring-tide-200', icon_: 'bg-tide-100 text-tide-700', tag: 'text-tide-700' },
  CHEER: { label: 'Nice one', icon: PartyPopper, box: 'bg-emerald-50 ring-emerald-200', icon_: 'bg-emerald-100 text-emerald-800', tag: 'text-emerald-800' },
} as const

function InlineBanner({ intervention, onDismiss }: { intervention: Intervention; onDismiss: () => void }) {
  const contacts = useWellnessContacts()
  const tone = TONE[intervention.severity as keyof typeof TONE]
  const Icon = tone.icon
  const titleId = useId()
  const action = intervention.actions[0]
  const opens = action?.kind === 'open' && !!action.href
  const href = opens ? action!.href! : ((action?.contact && contactHref(action.contact, 'book', contacts)) ?? TEAM_PAGE)
  // In-app pages use the action's own label; contacts are named after who it opens a conversation with.
  const label = opens
    ? action!.label
    : action?.contact === 'dietitian'
      ? 'Talk to Dietitian'
      : action?.contact === 'therapist'
        ? 'Talk to Therapist'
        : 'Contact the wellness team'
  const ActionIcon = opens ? ArrowRight : action && action.contact !== 'eap' ? MessageCircleHeart : CalendarCheck

  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      aria-labelledby={titleId}
      className={`relative flex flex-col gap-4 rounded-3xl p-4 pr-12 ring-1 sm:flex-row sm:items-center sm:p-5 sm:pr-14 ${tone.box}`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${tone.icon_}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wide ${tone.tag}`}>{tone.label}</p>
          <h2 id={titleId} className="font-bold leading-snug">
            {intervention.title}
          </h2>
          <p className="mt-0.5 text-sm text-ink/80">{intervention.message}</p>
        </div>
      </div>

      {action && (
        <Link
          href={href}
          {...(isExternal(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="btn-primary shrink-0 self-start sm:self-center"
        >
          <ActionIcon className="h-4 w-4" aria-hidden />
          {label}
          {isExternal(href) && <span className="sr-only">(opens in a new tab)</span>}
        </Link>
      )}

      <button
        type="button"
        onClick={onDismiss}
        aria-label={`Dismiss: ${intervention.title}`}
        className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-full text-ink/60 transition hover:bg-white/70 hover:text-ink"
      >
        <X className="h-5 w-5" aria-hidden />
      </button>
    </motion.section>
  )
}

/* ---------- CRITICAL ---------- */

const ACTION_ICON = { call: Phone, chat: MessageCircleHeart, book: CalendarCheck, open: ArrowRight } as const

function CrisisDialog({ intervention, onAcknowledge }: { intervention: Intervention; onAcknowledge: () => void }) {
  const contacts = useWellnessContacts()
  const EMERGENCY_NUMBER = contacts.emergency
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const titleId = useId()
  const descId = useId()

  // Only actions with real contact details become buttons.
  const actions = intervention.actions
    .map((a) => ({ ...a, href: a.kind === 'open' ? (a.href ?? null) : a.contact ? contactHref(a.contact, a.kind, contacts) : null }))
    .filter((a): a is InterventionAction & { href: string } => a.href != null)
  const eapPhone = contacts.byId.eap.phone

  useEffect(() => setMounted(true), [])

  // Modal behaviour: lock scroll, make the page behind inert, keep focus inside, ignore Esc.
  useEffect(() => {
    if (!mounted) return
    const panel = panelRef.current
    const portal = panel?.closest('[data-crisis-root]')
    const siblings = Array.from(document.body.children).filter((el) => el !== portal && !el.hasAttribute('inert') && !['SCRIPT', 'NEXT-ROUTE-ANNOUNCER'].includes(el.tagName))
    siblings.forEach((el) => el.setAttribute('inert', ''))
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
    focusables()[0]?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault()
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      siblings.forEach((el) => el.removeAttribute('inert'))
      document.body.style.overflow = overflow
    }
  }, [mounted])

  if (!mounted) return null

  return createPortal(
    <div data-crisis-root className="fixed inset-0 z-[70] flex items-end justify-center bg-[#071A1F]/85 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:items-center sm:p-4">
      <motion.div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-[#0B2228] text-white shadow-2xl ring-2 ring-white/25"
      >
        <div className="h-1.5 rounded-t-3xl bg-[#E5553C] sm:h-2" aria-hidden />
        <div className="p-5 sm:p-7">
          {/* Phones: icon beside the title, so the whole prompt fits without scrolling. */}
          <div className="flex items-center gap-3 sm:block">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0B2228] sm:h-12 sm:w-12 sm:rounded-2xl">
              <LifeBuoy className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
            </span>
            <h2 id={titleId} className="font-display text-xl font-extrabold leading-tight text-white sm:mt-4 sm:text-2xl">
              {intervention.title}
            </h2>
          </div>
          <p id={descId} className="mt-3 text-[15px] leading-snug text-white/90 sm:mt-2 sm:text-base sm:leading-normal">
            {contacts.locked && EMERGENCY_NUMBER ? `It sounds like today is really hard. You don’t have to face it alone: if you’re in danger or thinking about harming yourself, call ${EMERGENCY_NUMBER} now.` : intervention.message}
          </p>

          {/* The helpline, as large as possible: the EAP if it's set, else the emergency number. */}
          <div className="mt-4 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/25 sm:mt-5 sm:p-4">
            {eapPhone ? (
              <>
                <p className="text-sm font-bold text-white/90">EAP crisis helpline</p>
                <a href={telHref(eapPhone)} className="mt-0.5 block font-display text-2xl font-extrabold tracking-tight underline-offset-4 hover:underline sm:mt-1 sm:text-3xl">
                  {eapPhone}
                </a>
              </>
            ) : EMERGENCY_NUMBER ? (
              <>
                <p className="text-sm font-bold text-white/90">Emergency services</p>
                <a href={telHref(EMERGENCY_NUMBER)} className="mt-0.5 block font-display text-2xl font-extrabold tracking-tight underline-offset-4 hover:underline sm:mt-1 sm:text-3xl">
                  {EMERGENCY_NUMBER}
                </a>
              </>
            ) : (
              <p className="font-display text-xl font-extrabold leading-snug">If you’re in danger right now, call your local emergency number.</p>
            )}
            {(eapPhone || EMERGENCY_NUMBER) && (
              <p className="mt-1 text-sm text-white/90 sm:mt-2">
                In immediate danger? Call {EMERGENCY_NUMBER ?? 'your local emergency number'} now.
              </p>
            )}
          </div>

          <div className="mt-4 space-y-2 sm:mt-5 sm:space-y-2.5">
            {actions.map((a, i) => {
              const Icon = ACTION_ICON[a.kind]
              const external = isExternal(a.href)
              return (
                <a
                  key={a.label}
                  href={a.href}
                  // Opening an in-app inbox leaves this page, so count it as acknowledged.
                  onClick={a.href.startsWith('/') ? onAcknowledge : undefined}
                  {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 text-base font-bold sm:min-h-[52px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                    i === 0 ? 'bg-white text-[#0B2228] hover:bg-white/90' : 'bg-white/10 text-white ring-1 ring-white/40 hover:bg-white/20'
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {a.label}
                  {external && <span className="sr-only">(opens in a new tab)</span>}
                </a>
              )
            })}
            {actions.length === 0 && contacts.locked && EMERGENCY_NUMBER && (
              <a
                href={telHref(EMERGENCY_NUMBER)}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 text-base font-bold text-[#0B2228] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[52px]"
              >
                <Phone className="h-5 w-5" aria-hidden />
                Call {EMERGENCY_NUMBER}
              </a>
            )}
            {actions.length === 0 && !contacts.locked && (
              <Link
                href={TEAM_PAGE}
                onClick={onAcknowledge}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-white px-5 sm:min-h-[52px] text-base font-bold text-[#0B2228] transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <MessageCircleHeart className="h-5 w-5" aria-hidden />
                See your wellness team
              </Link>
            )}
          </div>

          <button
            type="button"
            onClick={onAcknowledge}
            className="mt-2 min-h-[44px] w-full rounded-full text-sm font-bold sm:mt-4 text-white/90 underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            I’m okay for now
          </button>
        </div>
      </motion.div>
    </div>,
    document.body,
  )
}
