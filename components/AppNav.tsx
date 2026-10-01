'use client'

import { motion } from 'framer-motion'
import { BarChart3, Droplets, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const ITEMS = [
  { href: '/dashboard', label: 'Today', icon: Droplets },
  { href: '/stats', label: 'Stats', icon: BarChart3 },
  { href: '/profile', label: 'Profile', icon: UserRound },
]

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-y-0 md:left-0 md:right-auto md:w-24 md:border-r md:border-t-0 md:pb-0"
    >
      <div className="hidden justify-center pt-7 md:flex">
        <svg viewBox="0 0 24 24" className="h-8 w-8" aria-label="Tidewell">
          <path d="M12 2.5C12 2.5 4.5 10.6 4.5 15a7.5 7.5 0 0 0 15 0C19.5 10.6 12 2.5 12 2.5Z" fill="#2189D6" />
          <path d="M7.6 15.4c1.4-1 2.9-1 4.4 0s3 1 4.4 0" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </div>
      <ul className="flex justify-around md:mt-8 md:flex-col md:items-center md:gap-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-2xl px-5 py-2.5 text-xs font-bold transition md:px-4 ${
                  active ? 'text-tide-700' : 'text-muted hover:text-ink'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-2xl bg-tide-100"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
