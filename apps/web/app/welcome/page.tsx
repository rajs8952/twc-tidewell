import type { Metadata } from 'next'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { Welcome } from '@/components/onboarding/Welcome'

export const metadata: Metadata = { title: 'Welcome' }

/** The welcome screen: chosen focus and reminders, once after sign-up (and any time from Home's checklist). */
export default function WelcomePage() {
  return (
    <div className="min-h-dvh">
      <div className="bg-brand-gradient h-1.5 w-full" aria-hidden />
      <header className="mx-auto flex max-w-2xl items-center justify-between px-5 py-5">
        <Link href="/dashboard" className="rounded-xl" aria-label="OmniWell home">
          <Logo />
        </Link>
      </header>
      <main className="px-5 pb-16 pt-4">
        <Welcome />
      </main>
    </div>
  )
}
