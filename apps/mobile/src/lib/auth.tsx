import type { Session } from '@supabase/supabase-js'
import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react'
import { clearCache } from './cache'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * The signed-in session, shared by every screen. `loading` is true until
 * the saved session has been read from secure storage (the splash screen
 * stays up until then, so nobody sees the sign-in screen flash).
 *
 * `holdSignIn`: a password-reset code signs the person in, but they must
 * choose their new password before the app opens.
 * ------------------------------------------------------------------ */

const AuthContext = createContext<{ session: Session | null; loading: boolean; held: boolean; holdSignIn: (hold: boolean) => void } | null>(null)

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [held, holdSignIn] = useState(false)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .finally(() => setLoading(false))
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      // Nothing saved for the last person stays on the phone.
      if (event === 'SIGNED_OUT') void clearCache()
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext value={{ session, loading, held, holdSignIn }}>{children}</AuthContext>
}

export function useSession() {
  const value = use(AuthContext)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>.')
  return value
}

/* ---------- Checks and messages (the same rules and wording as the website) ---------- */

export const PASSWORD_MIN = 8
const PASSWORD_MAX = 72
export const CODE_LENGTH = 6

export function validateEmail(e: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = e.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) return { ok: false, error: 'Enter a valid email address.' }
  return { ok: true, value: v }
}

export function validatePassword(p: string): string | null {
  if (p.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for the password.`
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return `Keep the password under ${PASSWORD_MAX} characters.`
  return null
}

type AuthProblem = { name?: string; code?: string; message: string; status?: number }

/** The request never got an answer (no signal, app switched away), as opposed to a real refusal. */
export function isNetworkError(e: AuthProblem) {
  const m = e.message.toLowerCase()
  return e.name === 'AuthRetryableFetchError' || m.includes('network request failed') || m.includes('failed to fetch') || m.includes('network') || (e.status === 0 && !m.includes('expired'))
}

export const NETWORK_MESSAGE = 'Couldn’t reach OmniWell. Check your connection and try again.'

/** Sign-in errors, in plain words. */
export function signInError(e: AuthProblem) {
  if (isNetworkError(e)) return NETWORK_MESSAGE
  if (e.message === 'Invalid login credentials') return 'That email and password don’t match an account.'
  if (e.status === 429 || /rate limit/i.test(e.message)) return 'Too many tries just now. Wait a minute and try again.'
  return e.message
}

/** Code errors, in plain words. */
export function codeError(e: AuthProblem) {
  if (isNetworkError(e)) return 'Couldn’t reach OmniWell. Check your connection, then try again; your code is still valid.'
  const m = e.message.toLowerCase()
  if (e.code === 'otp_expired' || m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Check it, or send a new one.'
  if (e.status === 429 || m.includes('rate limit') || m.includes('security purposes')) return 'Too many tries just now. Wait a minute and try again.'
  return e.message
}

/** Password-change errors, in plain words. */
export function passwordError(e: AuthProblem) {
  if (isNetworkError(e)) return NETWORK_MESSAGE
  if (e.code === 'same_password') return 'Choose a password that’s different from your current one.'
  if (e.code === 'weak_password') return e.message || 'That password is too weak. Try a longer one.'
  return e.message
}
