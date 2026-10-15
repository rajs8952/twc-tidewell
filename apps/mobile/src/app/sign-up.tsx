import { HEIGHT_CM, bmi, bmiBand } from '@rajs8952/core/biometrics'
import { ACTIVITY_LEVELS, GENDERS, type Activity, type Gender } from '@rajs8952/core/hydration'
import { router } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { CodeEntry } from '@/components/CodeEntry'
import { Chip, ChipRow } from '@/components/kit'
import { AuthScreen, Button, Field, Lead, LinkButton, Notice, Title } from '@/components/ui'
import { PASSWORD_MIN, codeError, isNetworkError, NETWORK_MESSAGE, validateEmail, validatePassword } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Create an account, the same way as the website's sign-up (same
 * accounts and the same details saved):
 *   account   name, email, password
 *   body      height, weight, sex, activity (for BMI and the water goal)
 *   verify    the 6-digit code we email, which confirms the address
 * Once confirmed they're signed in, and the root layout opens the app.
 * A profile photo can be added afterwards from Me.
 * ------------------------------------------------------------------ */

type Step = 'account' | 'body' | 'verify'

export default function SignUp() {
  const [step, setStep] = useState<Step>('account')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('70')
  const [gender, setGender] = useState<Gender>('unspecified')
  const [activity, setActivity] = useState<Activity>('moderate')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const h = Number(height.replace(',', '.'))
  const w = Number(weight.replace(',', '.'))
  const value = h >= HEIGHT_CM.min && h <= HEIGHT_CM.max && w >= 25 && w <= 300 ? bmi(h, w) : null

  function next() {
    setError(null)
    if (!name.trim()) return setError('Add your name.')
    const e = validateEmail(email)
    if (!e.ok) return setError(e.error)
    const p = validatePassword(password)
    if (p) return setError(p)
    setStep('body')
  }

  async function create() {
    setError(null)
    if (!(h >= HEIGHT_CM.min && h <= HEIGHT_CM.max)) return setError(`Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.`)
    if (!(w >= 25 && w <= 300)) return setError('Enter a weight between 25 and 300 kg.')
    const parsed = validateEmail(email)
    if (!parsed.ok) return setError(parsed.error)
    setBusy(true)
    // The profile is created from these details by the database (as for the website's sign-up).
    const { data, error: e } = await supabase.auth.signUp({
      email: parsed.value,
      password,
      options: { data: { full_name: name.trim(), height_cm: h, weight_kg: w, gender, activity_level: activity } },
    })
    if (e) {
      setBusy(false)
      if (isNetworkError(e)) return setError(NETWORK_MESSAGE)
      if (e.status === 429 || /rate limit/i.test(e.message)) return setError('Too many tries just now. Wait a few minutes and try again.')
      return setError(e.message)
    }
    if (data.user && data.user.identities?.length === 0) {
      setBusy(false)
      setStep('account')
      return setError('An account with this email already exists. Log in instead.')
    }
    // Signed in straight away (no email check on this project): the app opens by itself.
    if (data.session && data.user) return void saveHeight(data.user.id).catch(() => {})
    setBusy(false)
    setStep('verify')
  }

  /**
   * Signed in: save the height too. The database's sign-up function (handle_new_user in
   * supabase/schema.sql) copies the name, weight, sex and activity, but not the height.
   */
  async function saveHeight(userId: string) {
    await supabase.from('profiles').update({ height_cm: h }).eq('id', userId).is('height_cm', null)
  }

  async function resend() {
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase() })
    return e ? codeError(e) : null
  }

  return (
    <AuthScreen compact={step !== 'account'}>
      {step === 'account' && (
        <>
          <Text style={styles.step}>Step 1 of 2</Text>
          <Title>Create your account</Title>
          <Lead>Six trackers, one place. It takes about a minute.</Lead>
          <View style={styles.form}>
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" textContentType="name" returnKeyType="next" maxLength={80} />
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" returnKeyType="next" />
            <Field label="Password" secure value={password} onChangeText={setPassword} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" returnKeyType="go" onSubmitEditing={next} />
            <Text style={styles.hint}>At least {PASSWORD_MIN} characters.</Text>
            {error && <Notice tone="error">{error}</Notice>}
            <Button title="Continue" onPress={next} />
          </View>
          <View style={styles.footer}>
            <Text style={styles.muted}>Already have an account?</Text>
            <LinkButton title="Log in" onPress={() => router.back()} />
          </View>
        </>
      )}

      {step === 'body' && (
        <>
          <LinkButton title="‹ Back" onPress={() => (setError(null), setStep('account'))} />
          <Text style={[styles.step, { marginTop: 16 }]}>Step 2 of 2</Text>
          <Title>A little about you</Title>
          <Lead>We use this for your BMI and smart daily targets. You can change it any time in your profile.</Lead>
          <View style={styles.form}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^0-9.,]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="e.g. 170" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Weight (kg)" value={weight} onChangeText={(t) => setWeight(t.replace(/[^0-9.,]/g, '').slice(0, 6))} keyboardType="decimal-pad" />
              </View>
            </View>
            {value != null && (
              <Text style={styles.bmi}>
                BMI <Text style={styles.bmiValue}>{value}</Text> · {bmiBand(value).label.toLowerCase()}
              </Text>
            )}
            <Text style={styles.label}>Sex</Text>
            <ChipRow>
              {GENDERS.map((g) => (
                <Chip key={g.id} label={g.label} selected={gender === g.id} onPress={() => setGender(g.id)} />
              ))}
            </ChipRow>
            <Text style={styles.label}>How active are you?</Text>
            <ChipRow>
              {ACTIVITY_LEVELS.map((a) => (
                <Chip key={a.id} label={a.label} selected={activity === a.id} onPress={() => setActivity(a.id)} />
              ))}
            </ChipRow>
            <Text style={styles.hint}>{ACTIVITY_LEVELS.find((a) => a.id === activity)?.hint}</Text>
            {error && <Notice tone="error">{error}</Notice>}
            <Button title="Create account" onPress={() => void create()} busy={busy} />
          </View>
        </>
      )}

      {step === 'verify' && (
        <>
          <LinkButton title="‹ Back" onPress={() => (setError(null), setStep('account'))} />
          <View style={{ height: 16 }} />
          <CodeEntry
            email={email.trim().toLowerCase()}
            type="signup"
            // The code signs them in: the root layout then opens the app.
            onVerified={() => {
              supabase.auth.getUser().then(({ data }) => data.user && saveHeight(data.user.id)).catch(() => {})
            }}
            onResend={resend}
            onChangeEmail={() => (setError(null), setStep('account'))}
          />
        </>
      )}
    </AuthScreen>
  )
}

const styles = StyleSheet.create({
  step: { fontSize: 13, fontWeight: '800', color: COLORS.tide600, marginBottom: 4 },
  form: { marginTop: 22, gap: 14 },
  row: { flexDirection: 'row', gap: 12 },
  hint: { marginTop: -6, fontSize: 13, color: COLORS.muted },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  bmi: { fontSize: 14, color: COLORS.muted },
  bmiValue: { fontWeight: '800', color: COLORS.ink },
  footer: { marginTop: 22, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  muted: { fontSize: 14, color: COLORS.muted },
})
