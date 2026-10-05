import { redirect } from 'next/navigation'
import { LandingPage } from '@/components/LandingPage'
import { createClient } from '@/lib/supabase/server'

/** Signed-in visitors go straight to their dashboard; everyone else sees the landing page. */
export default async function Home() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')
  return <LandingPage />
}
