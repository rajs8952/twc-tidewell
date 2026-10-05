'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { House, LayoutGrid, Sparkles, UserRound, X, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Logo, LogoMark } from './Logo'
import { BRAND } from '@/lib/brand'
import { TRACKERS } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * App navigation.
 *  - lg+: labelled sidebar (Home, the six trackers, Insights, Profile)
 *  - md:  the same links as a compact icon rail
 *  - phones: bottom bar (Home · Trackers · Insights · Profile);
 *    "Trackers" opens a sheet with all six, since eight tabs don't fit.
 *  The water Garden and Stats live inside /water (Today · Stats · Garden).
 * ------------------------------------------------------------------ */

const HOME = { href: '/dashboard', label: 'Home', icon: House, accent: '#0F2F37' }
const INSIGHTS = { href: '/insights', label: 'Insights', icon: Sparkles, accent: '#6A55C9' }
const PROFILE = { href: '/profile', label: 'Profile', icon: UserRound, accent: '#0F2F37' }
const TRACKER_LINKS = TRACKERS.map((t) => ({ href: t.href, label: t.name, icon: t.icon, accent: t.accent }))

type Item = { href: string; label: string; icon: LucideIcon; accent: string }

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`)

/** One sidebar row: icon-only on the md rail (with a tooltip), icon + label on lg. */
function SideLink({ item, pathname }: { item: Item; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        className={`relative flex items-center justify-center rounded-2xl p-1.5 text-sm font-bold transition lg:justify-start lg:gap-3 lg:px-3 lg:py-2 ${
          active ? 'text-ink' : 'text-muted hover:bg-mist hover:text-ink'
        }`}
      >
        {active && (
          <motion.span
            layoutId="side-pill"
            className="absolute inset-0 -z-10 rounded-2xl bg-mist ring-1 ring-line"
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          />
        )}
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition"
          style={active ? { background: item.accent, color: '#fff' } : { color: item.accent }}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {/* The md rail is icon-only (label via title + screen readers); lg shows the label. */}
        <span className="sr-only lg:not-sr-only lg:truncate">{item.label}</span>
      </Link>
    </li>
  )
}

function Sidebar({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col border-r border-line bg-white/90 backdrop-blur md:flex lg:w-64"
    >
      <Link href="/dashboard" className="mx-auto mt-6 rounded-xl lg:mx-5" aria-label={`${BRAND.name} home`}>
        <LogoMark className="h-9 w-9 lg:hidden" />
        <Logo className="hidden lg:inline-flex" />
      </Link>
      <div className="mt-6 flex flex-1 flex-col overflow-y-auto px-2 pb-4 lg:px-3">
        <ul className="space-y-1">
          <SideLink item={HOME} pathname={pathname} />
        </ul>
        <p className="mb-1 mt-4 hidden px-3 text-[11px] font-bold uppercase tracking-wide text-muted lg:block">Trackers</p>
        <div className="mx-auto my-2 h-px w-8 bg-line lg:hidden" aria-hidden />
        <ul className="space-y-1">
          {TRACKER_LINKS.map((item) => (
            <SideLink key={item.href} item={item} pathname={pathname} />
          ))}
        </ul>
        <div className="mx-auto my-2 h-px w-8 bg-line lg:mx-3 lg:my-3 lg:w-auto" aria-hidden />
        <ul className="space-y-1">
          <SideLink item={INSIGHTS} pathname={pathname} />
        </ul>
        <ul className="mt-auto space-y-1 pt-4">
          <SideLink item={PROFILE} pathname={pathname} />
        </ul>
      </div>
    </nav>
  )
}

/** Bottom sheet with all six trackers, opened from the phone bar. */
function TrackerSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.button
            type="button"
            aria-label="Close trackers"
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tracker-sheet-title"
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl outline-none"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" aria-hidden />
            <div className="mb-3 flex items-center justify-between">
              <h2 id="tracker-sheet-title" className="text-lg font-bold">
                Trackers
              </h2>
              <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-mist" aria-label="Close">
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {TRACKER_LINKS.map((t) => {
                const active = isActive(pathname, t.href)
                const Icon = t.icon
                return (
                  <li key={t.href}>
                    <Link
                      href={t.href}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-sm font-bold ring-1 transition ${
                        active ? 'bg-mist ring-ink/20' : 'ring-line hover:bg-mist'
                      }`}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: t.accent }}>
                        <Icon className="h-5 w-5" aria-hidden />
                      </span>
                      {t.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

function BottomBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const onTracker = TRACKER_LINKS.some((t) => isActive(pathname, t.href))

  // Close the sheet whenever the route changes.
  useEffect(() => setOpen(false), [pathname])

  const close = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  const tab = (item: Item) => {
    const active = isActive(pathname, item.href)
    const Icon = item.icon
    return (
      <li key={item.href} className="flex-1">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={`relative flex flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold transition ${active ? 'text-ink' : 'text-muted'}`}
        >
          {active && <motion.span layoutId="bar-pill" className="absolute inset-x-1 inset-y-0 -z-10 rounded-2xl bg-mist" />}
          <Icon className="h-5 w-5" style={active ? { color: item.accent } : undefined} aria-hidden />
          {item.label}
        </Link>
      </li>
    )
  }

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="flex items-stretch">
          {tab(HOME)}
          <li className="flex-1">
            <button
              ref={triggerRef}
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={`relative flex w-full flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold transition ${
                onTracker || open ? 'text-ink' : 'text-muted'
              }`}
            >
              {onTracker && <motion.span layoutId="bar-pill" className="absolute inset-x-1 inset-y-0 -z-10 rounded-2xl bg-mist" />}
              <LayoutGrid className="h-5 w-5" aria-hidden />
              Trackers
            </button>
          </li>
          {tab(INSIGHTS)}
          {tab(PROFILE)}
        </ul>
      </nav>
      <TrackerSheet open={open} onClose={close} pathname={pathname} />
    </>
  )
}

export function AppNav() {
  const pathname = usePathname()
  return (
    <>
      <Sidebar pathname={pathname} />
      <BottomBar pathname={pathname} />
    </>
  )
}
