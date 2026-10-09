import Link from 'next/link'
import { myStaffTeam } from '@/app/actions/therapist'
import { Logo } from '@/components/Logo'
import { LogoutButton } from '@/components/profile/LogoutButton'
import { CoachProfileButton } from './CoachProfileButton'
import { NotificationBell } from './NotificationBell'
import { TEAMS, type Team } from '@/lib/messages'

/**
 * Header and access check for a wellness-team portal (/therapist, /dietitian).
 * Only members of `team` get past it; staff from the other team are pointed
 * to their own portal, and employees are turned away.
 */
export async function StaffPortalShell({ team, children }: { team: Team; children: React.ReactNode }) {
  const mine = await myStaffTeam()
  const info = TEAMS[team]

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="rounded-full px-2.5 py-1 text-xs font-bold text-ink" style={{ background: `${info.accent}26` }}>
              {info.label} portal
            </span>
          </div>
          <div className="flex items-center gap-2">
            {mine === team && <NotificationBell portalPath={info.portalPath} />}
            {mine === team && <CoachProfileButton />}
            <LogoutButton compact />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        {mine === team ? (
          children
        ) : (
          <div className="mx-auto max-w-md rounded-3xl bg-white p-6 text-center ring-1 ring-line">
            <h1 className="text-xl font-extrabold">This area is for the {info.label.toLowerCase()} team</h1>
            {mine ? (
              <>
                <p className="mt-2 text-sm text-muted">You’re on the {TEAMS[mine].label.toLowerCase()} team, so you can’t see these conversations.</p>
                <Link href={TEAMS[mine].portalPath} className="btn-primary mt-5">
                  Go to the {TEAMS[mine].label.toLowerCase()} portal
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm text-muted">Your account isn’t set up as wellness staff. If you think it should be, ask your OmniWell administrator.</p>
                <Link href="/dashboard" className="btn-primary mt-5">
                  Go to OmniWell
                </Link>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
