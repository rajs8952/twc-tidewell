'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Signs the user out on the server: revokes this device's session with
 * Supabase and clears the auth cookies, then sends them to the login page.
 * Other devices stay signed in (scope 'local').
 */
export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut({ scope: 'local' })
  // Drop any cached pages that were rendered for the signed-in user.
  revalidatePath('/', 'layout')
  redirect('/login')
}
