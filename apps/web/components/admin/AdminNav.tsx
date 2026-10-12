'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin', label: 'Users' },
  { href: '/admin/contacts', label: 'Wellness contacts' },
  { href: '/hr', label: 'Company insights' },
]

/** The admin portal's sections, under the header. */
export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Admin sections" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
      {LINKS.map((l) => {
        const active = pathname === l.href
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-bold transition ${active ? 'bg-ink text-white' : 'text-muted hover:bg-mist hover:text-ink'}`}
          >
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
