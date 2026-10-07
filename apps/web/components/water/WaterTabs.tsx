'use client'

import { motion } from 'framer-motion'
import { BarChart3, Droplets, Sprout } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export const WATER_TABS = [
  { href: '/water', label: 'Today', icon: Droplets },
  { href: '/water/stats', label: 'Stats', icon: BarChart3 },
  { href: '/water/garden', label: 'Garden', icon: Sprout },
] as const

/** Section tabs for the Water tracker: Today · Stats · Garden. */
export function WaterTabs() {
  const pathname = usePathname()
  return (
    <nav aria-label="Water" className="mb-6 sm:mb-8">
      <ul className="inline-grid grid-cols-3 rounded-full bg-white p-1 ring-1 ring-line">
        {WATER_TABS.map(({ href, label, icon: Icon }) => {
          // "Today" is the section root, so it's active only on /water itself.
          const active = href === '/water' ? pathname === href : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition sm:px-5 ${
                  active ? 'text-white' : 'text-muted hover:text-ink'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="water-tab"
                    className="absolute inset-0 -z-0 rounded-full bg-tide-500"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon className="relative h-4 w-4" aria-hidden />
                <span className="relative">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
