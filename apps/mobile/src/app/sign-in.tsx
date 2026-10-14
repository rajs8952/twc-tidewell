import * as WebBrowser from 'expo-web-browser'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CodeEntry } from '@/components/CodeEntry'
import { Button, Field, Lead, LinkButton, Logo, Notice, Screen, Title } from '@/components/ui'
import { NETWORK_MESSAGE, PASSWORD_MIN, codeError, isNetworkError, passwordError, signInError, useSession, validateEmail, validatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Signing in, the same way as on the website (same accounts):
 *   sign-in       email and password
 *   forgot        "Forgot password?": we email a 6-digit code
 *   reset-code    enter that code (it signs them in)…
 *   new-password  …then choose a new password
 *   confirm-code  an account that was never confirmed: a fresh code confirms it
 * Once signed in, the root layout moves them into the app.
 * ------------------------------------------------------------------ */

const SIGN_UP_URL = 'https://omniwell-app.vercel.app/signup'

type Mode = 'sign-in' | 'forgot' | 'reset-code' | 'new-password' | 'confirm-code'

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { holdSignIn } = useSession()

  // A reset code signs them in; keep them here until the new password is saved.
  useEffect(() => {
    holdSignIn(mode === 'reset-code' || mode === 'new-password')
  }, [mode, holdSignIn])
  useEffect(() => () => holdSignIn(false), [holdSignIn])

  function switchTo(next: Mode) {
    setMode(next)
    setError(null)
  }

  async function signIn() {
    const parsed = validateEmail(email)
    if (!parsed.ok) return setError(parsed.error)
    if (!password) return setError('Enter your password.')
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.auth.signInWithPassword({ email: parsed.value, password })
    if (!e) {
      // Stay "busy" while the root layout opens the app; the password is cleared from memory.
      setPassword('')
      return
    }
    setBusy(false)
    if (e.message.toLowerCase().includes('email not confirmed')) {
      // Never confirmed: send a fresh code and ask for it here.
      const problem = await resendSignupCode()
      if (problem) setError(problem)
      setMode('confirm-code')
      return
    }
    setError(signInError(e))
  }

  async function sendResetCode(): Promise<string | null> {
    const parsed = validateEmail(email)
    if (!parsed.ok) return parsed.error
    const { error: e } = await supabase.auth.resetPasswordForEmail(parsed.value)
    if (!e) return null
    if (isNetworkError(e)) return NETWORK_MESSAGE
    if (e.status === 429 || /rate limit/i.test(e.message)) return 'Too many emails have been sent just now. Wait a few minutes and try again.'
    // Anything else isn't shown, so the form can't reveal whether an account exists.
    return null
  }

  async function forgot() {
    setBusy(true)
    setError(null)
    const problem = await sendResetCode()
    setBusy(false)
    if (problem) return setError(problem)
    setMode('reset-code')
  }

  async function resendSignupCode() {
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    return e ? codeError(e) : null
  }

  async function savePassword() {
    const problem = validatePassword(password)
    if (problem) return setError(problem)
    if (password !== confirm) return setError('The two passwords don’t match.')
    setBusy(true)
    setError(null)
    const { error: e } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (e) return setError(passwordError(e))
    setPassword('')
    setConfirm('')
    // Signed in by the code and the password is set: the root layout opens the app.
    setMode('sign-in')
  }

  return (
    <Screen>
      <Logo />
      <View style={styles.body}>
        {mode === 'sign-in' && (
          <>
            <Title>Welcome back</Title>
            <Lead>Log in to pick up where you left off.</Lead>
            <View style={styles.form}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                returnKeyType="next"
              />
              <Field
                label="Password"
                secure
                value={password}
                onChangeText={setPassword}
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void signIn()}
                right={<LinkButton title="Forgot password?" onPress={() => switchTo('forgot')} />}
              />
              {error && <Notice tone="error">{error}</Notice>}
              <Button title="Log in" onPress={() => void signIn()} busy={busy} />
            </View>
            <View style={styles.footer}>
              <Text style={styles.muted}>New to OmniWell?</Text>
              <LinkButton title="Create an account" onPress={() => void WebBrowser.openBrowserAsync(SIGN_UP_URL)} />
            </View>
          </>
        )}

        {mode === 'forgot' && (
          <>
            <LinkButton title="‹ Back to log in" onPress={() => switchTo('sign-in')} />
            <View style={styles.gap} />
            <Title>Forgot your password?</Title>
            <Lead>Enter your email and we’ll send you a code to choose a new one. If you were invited by your company, this is also how you set up your account.</Lead>
            <View style={styles.form}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="username"
                autoFocus
                returnKeyType="send"
                onSubmitEditing={() => void forgot()}
              />
              {error && <Notice tone="error">{error}</Notice>}
              <Button title="Send code" onPress={() => void forgot()} busy={busy} />
            </View>
          </>
        )}

        {(mode === 'reset-code' || mode === 'confirm-code') && (
          <>
            <LinkButton title="‹ Back to log in" onPress={() => switchTo('sign-in')} />
            <View style={styles.gap} />
            {mode === 'confirm-code' && error && <Notice tone="error">{error}</Notice>}
            <CodeEntry
              email={email.trim().toLowerCase()}
              type={mode === 'reset-code' ? 'recovery' : 'signup'}
              // A reset code signs them in: next, the new password. A signup code signs them straight in.
              onVerified={() => (mode === 'reset-code' ? switchTo('new-password') : undefined)}
              onResend={mode === 'reset-code' ? sendResetCode : resendSignupCode}
              onChangeEmail={() => switchTo(mode === 'reset-code' ? 'forgot' : 'sign-in')}
            />
          </>
        )}

        {mode === 'new-password' && (
          <>
            <Title>Choose your password</Title>
            <Lead>Use at least {PASSWORD_MIN} characters. You’ll use it to log in on your phone and on the website.</Lead>
            <View style={styles.form}>
              <Field label="New password" secure value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" autoFocus />
              <Field
                label="Confirm new password"
                secure
                value={confirm}
                onChangeText={setConfirm}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={() => void savePassword()}
              />
              {error && <Notice tone="error">{error}</Notice>}
              <Button title="Save password" onPress={() => void savePassword()} busy={busy} />
            </View>
          </>
        )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { marginTop: 40 },
  form: { marginTop: 28, gap: 16 },
  gap: { height: 20 },
  footer: { marginTop: 28, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  muted: { fontSize: 14, color: COLORS.muted },
})
