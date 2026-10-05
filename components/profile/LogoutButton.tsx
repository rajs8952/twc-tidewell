'use client'

import { Loader2, LogOut } from 'lucide-react'
import { useState, useTransition } from 'react'
import { signOut } from '@/app/actions/auth'
import { storageKey } from '@/lib/brand'

/** Things this browser keeps for the signed-in user; cleared on logout. */
const USER_KEYS = { local: [storageKey('pending-avatar')], session: [storageKey('timezone-synced')] }

function clearUserStorage() {
  try {
    USER_KEYS.local.forEach((k) => localStorage.removeItem(k))
    USER_KEYS.session.forEach((k) => sessionStorage.removeItem(k))
  } catch {
    /* storage unavailable: nothing to clear */
  }
}

/**
 * Red logout button. The sign-out runs on the server (app/actions/auth.ts),
 * which clears the session cookies and redirects to /login.
 */
export function LogoutButton({ className = '' }: { className?: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function logout() {
    setError(null)
    clearUserStorage()
    startTransition(async () => {
      try {
        await signOut()
      } catch {
        // A successful sign-out navigates away; reaching here means the request failed.
        setError('Couldn’t log out. Check your connection and try again.')
      }
    })
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={logout}
        disabled={pending}
        className="btn w-full bg-alert text-white hover:bg-alert/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alert sm:w-auto"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <LogOut className="h-4 w-4" aria-hidden />}
        {pending ? 'Logging out…' : 'Log out'}
      </button>
      {error && (
        <p role="alert" className="notice-error mt-3">
          {error}
        </p>
      )}
    </div>
  )
}
