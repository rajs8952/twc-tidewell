'use server'

import type { ActionResult } from '@rajs8952/core/types'
import { headers } from 'next/headers'
import { validateEmail, validatePassword } from '@/lib/admin'
import { SIGNED_OUT, signedIn } from '@/lib/supabase/actions'
import { createClient } from '@/lib/supabase/server'

/*
 * Password management for everyone (not just admins):
 *   requestPasswordReset  "Forgot password?" on the login page
 *   updatePassword        /update-password, reached from the reset email or Profile
 */

/** Where the reset link sends people: the email callback, which signs them in and moves on to /update-password. */
function resetRedirect() {
  // Server actions are POSTs, and Next.js already checks their Origin matches the host.
  const origin = headers().get('origin') ?? 'https://omniwell-app.vercel.app'
  return `${origin}/auth/callback?next=${encodeURIComponent('/update-password')}`
}

/**
 * Emails a reset link. Always answers the same way whether or not the email
 * has an account, so the form can't be used to find out who is registered.
 */
export async function requestPasswordReset(email: string): Promise<ActionResult<null>> {
  const parsed = validateEmail(email)
  if (!parsed.ok) return parsed

  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.value, { redirectTo: resetRedirect() })
  if (error) {
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return { ok: false, error: 'Too many emails have been sent just now. Wait a few minutes and try again.' }
    }
    // Anything else is logged but not shown, so it can't reveal whether the account exists.
    console.error('[password] reset email failed:', error.status, error.message)
  }
  return { ok: true, data: null }
}

/** Sets a new password for the signed-in user (after a reset link, or from Profile). */
export async function updatePassword(newPassword: string, confirmPassword: string): Promise<ActionResult<null>> {
  const parsed = validatePassword(newPassword)
  if (!parsed.ok) return parsed
  if (newPassword !== confirmPassword) return { ok: false, error: 'The two passwords don’t match.' }

  const session = await signedIn()
  if (!session) return { ok: false, error: 'Your reset link has expired. Request a new one from the login page.' }

  const { error } = await session.supabase.auth.updateUser({ password: parsed.value })
  if (error) {
    if (error.code === 'same_password') return { ok: false, error: 'Choose a password that’s different from your current one.' }
    if (error.code === 'weak_password') return { ok: false, error: error.message || 'That password is too weak. Try a longer one.' }
    if (error.code === 'reauthentication_needed') return { ok: false, error: 'For your security, log out and back in, then change your password.' }
    if (error.status === 401) return { ok: false, error: SIGNED_OUT }
    return { ok: false, error: error.message }
  }
  return { ok: true, data: null }
}
