import type { Metadata } from 'next'
import { WifiOff } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { WELLNESS_BY_ID, telHref } from '@/lib/wellness-team'

export const metadata: Metadata = { title: 'Offline', robots: { index: false } }
// Saved by the service worker at install time, so it must not depend on a request.
export const dynamic = 'force-static'

/** Shown by the service worker when a page can't load because there's no connection. */
export default function OfflinePage() {
  const eap = WELLNESS_BY_ID.eap.phone
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-7 text-center ring-1 ring-line">
        <LogoMark className="mx-auto h-10 w-10" />
        <span className="mx-auto mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-mist text-ink">
          <WifiOff className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-extrabold">You’re offline</h1>
        <p className="mt-2 text-sm text-muted">
          OmniWell needs a connection to load your data. Nothing you saved earlier is lost; reconnect and try again.
        </p>
        {/* A plain link, so it works even if the app's code hasn't loaded. */}
        <a href="/dashboard" className="btn-primary mt-6 w-full">
          Try again
        </a>
        {eap && (
          <p className="mt-5 text-xs text-muted">
            Need support now? Call the EAP on{' '}
            <a href={telHref(eap)} className="font-bold text-ink underline underline-offset-2">
              {eap}
            </a>
            .
          </p>
        )}
      </div>
    </main>
  )
}
