import { router } from 'expo-router'
import { useState } from 'react'
import { Card, Muted, TrackerScreen } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { PASSWORD_MIN, passwordError, signInError, useSession, validatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

/* ------------------------------------------------------------------
 * Change password (the website's Profile → password): the current one
 * first, which also refreshes the sign-in so the change is allowed, then
 * the new one twice. Forgotten it? Log out and use "Forgot password?".
 * ------------------------------------------------------------------ */

export default function ChangePassword() {
  const { session } = useSession()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    const email = session?.user.email
    if (!email) return setError('You’re signed out. Log in again to continue.')
    if (!current) return setError('Enter your current password.')
    const problem = validatePassword(next)
    if (problem) return setError(problem)
    if (next !== confirm) return setError('The two new passwords don’t match.')
    if (next === current) return setError('Choose a password that’s different from your current one.')
    setBusy(true)
    // Proves it's them, and gives a fresh sign-in (a long-open one can't change the password).
    const check = await supabase.auth.signInWithPassword({ email, password: current })
    if (check.error) {
      setBusy(false)
      return setError(check.error.message === 'Invalid login credentials' ? 'That isn’t your current password.' : signInError(check.error))
    }
    const { error: e } = await supabase.auth.updateUser({ password: next })
    setBusy(false)
    if (e) return setError(passwordError(e))
    setCurrent('')
    setNext('')
    setConfirm('')
    router.back()
  }

  return (
    <TrackerScreen title="Change password">
      <Card>
        <Muted>You’ll use the new password to log in on your phone and on the website.</Muted>
        <Field label="Current password" secure value={current} onChangeText={setCurrent} autoCapitalize="none" autoComplete="current-password" textContentType="password" />
        <Field label="New password" secure value={next} onChangeText={setNext} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" />
        <Muted style={{ fontSize: 13, marginTop: -6 }}>At least {PASSWORD_MIN} characters.</Muted>
        <Field label="Confirm new password" secure value={confirm} onChangeText={setConfirm} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="done" onSubmitEditing={() => void save()} />
        {error && <Notice tone="error">{error}</Notice>}
        <Button title="Change password" onPress={() => void save()} busy={busy} />
      </Card>
      <Muted style={{ fontSize: 13 }}>Forgotten your current password? Log out, then use “Forgot password?” on the login screen to get a code.</Muted>
    </TrackerScreen>
  )
}
