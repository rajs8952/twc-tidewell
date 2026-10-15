import { useEffect } from 'react'
import { AppState } from 'react-native'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * Keeps profiles.timezone in step with the phone, as the website does
 * from the browser (apps/web/components/TimezoneSync.tsx). Reminders,
 * the Monday recap and "today" on the server all use it: without it,
 * someone who only uses the app stays on UTC and gets their 9:00
 * reminder at 14:30 in India. Checked on opening the app and whenever it
 * comes back to the front (people travel); only written when it changed.
 * ------------------------------------------------------------------ */

let synced: string | null = null

async function sync() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!tz || tz === synced) return
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) return
  const { error } = await supabase.from('profiles').update({ timezone: tz }).eq('id', userId).neq('timezone', tz)
  if (!error) synced = tz
}

export function useTimezoneSync(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) {
      synced = null
      return
    }
    void sync()
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void sync())
    return () => sub.remove()
  }, [signedIn])
}
