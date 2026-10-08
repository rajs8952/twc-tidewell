import { ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { myRole } from '@/app/actions/roles'
import { Logo } from '@/components/Logo'
import { LogoutButton } from '@/components/profile/LogoutButton'

/**
 * Header and access check for the admin portal (/admin). The role is
 * checked on the server, so non-admins never receive the portal's UI.
 * (Every admin action checks again on the server, too.)
 */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const role = await myRole()

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" aria-label="OmniWell home" className="rounded-xl">
              <Logo />
            </Link>
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> Admin
            </span>
          </div>
          <LogoutButton compact />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {role === 'admin' ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-3xl bg-white p-6 text-center ring-1 ring-line">
            <h1 className="text-xl font-extrabold">This area is for administrators</h1>
            <p className="mt-2 text-sm text-muted">Your account doesn’t have admin access. If you think it should, ask an OmniWell administrator.</p>
            <Link href="/dashboard" className="btn-primary mt-5">
              Go to OmniWell
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
