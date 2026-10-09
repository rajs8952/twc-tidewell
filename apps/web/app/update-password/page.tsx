import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/AuthShell'
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Choose a new password' }

/**
 * Reached from a password-reset email (the callback has already signed the
 * person in) or from Profile → Change password. Needs a session; the
 * middleware sends anyone signed out to the login page first.
 */
export default async function UpdatePasswordPage() {
  const {
    data: { user },
  } = await createClient().auth.getUser()
  if (!user) redirect('/login?next=/update-password')

  return (
    <AuthShell>
      <UpdatePasswordForm email={user.email ?? ''} />
    </AuthShell>
  )
}
