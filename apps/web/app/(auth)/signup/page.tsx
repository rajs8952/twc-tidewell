'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'
import { AuthShell } from '@/components/AuthShell'
import { AvatarPicker } from '@/components/AvatarPicker'
import { VerifyCode, codeError } from '@/components/auth/VerifyCode'
import { ActivityPicker, GenderPicker, HeightInput, WeightInput } from '@rajs8952/ui'
import { BmiReadout } from '@rajs8952/tracker-bmi'
import { stashPendingAvatar, uploadAvatar } from '@/lib/avatar'
import { HEIGHT_CM } from '@rajs8952/core/biometrics'
import type { Activity, Gender } from '@rajs8952/core/hydration'
import { createClient } from '@/lib/supabase/client'

type Step = 'account' | 'body' | 'verify'

export default function SignupPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [step, setStep] = useState<Step>('account')

  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [heightCm, setHeightCm] = useState<number | null>(null)
  const [weightKg, setWeightKg] = useState(70)
  const [gender, setGender] = useState<Gender>('unspecified')
  const [activity, setActivity] = useState<Activity>('moderate')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function nextStep(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Use at least 8 characters for your password.')
    setStep('body')
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!(heightCm != null && heightCm >= HEIGHT_CM.min && heightCm <= HEIGHT_CM.max)) {
      return setError(`Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm (about 3′3″ to 8′2″).`)
    }
    if (!(weightKg >= 25 && weightKg <= 300)) return setError('Enter a weight between 25 and 300 kg.')
    setLoading(true)

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: { full_name: name.trim(), height_cm: heightCm, weight_kg: weightKg, gender, activity_level: activity },
      },
    })

    if (error) {
      setLoading(false)
      return setError(error.message)
    }
    if (data.user && data.user.identities?.length === 0) {
      setLoading(false)
      setStep('account')
      return setError('An account with this email already exists. Log in instead.')
    }

    if (data.session && data.user) return finish(data.user.id)

    // Email confirmation is on: we emailed a 6-digit code. Keep the photo locally in case they finish on another device.
    if (avatar) await stashPendingAvatar(avatar.blob)
    setLoading(false)
    setStep('verify')
  }

  /** Signed in (straight away, or once the code is accepted): add the photo, then the welcome screen. */
  async function finish(userId: string) {
    if (avatar) {
      try {
        await uploadAvatar(supabase, userId, avatar.blob)
      } catch {
        await stashPendingAvatar(avatar.blob)
      }
    }
    // First stop for a new account: choose a focus and reminders.
    router.replace('/welcome')
    router.refresh()
  }

  async function resendCode() {
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    return e ? codeError(e) : null
  }

  const slide = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    transition: { duration: 0.22 },
  }

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        {step === 'account' && (
          <motion.div key="account" {...slide}>
            <p className="text-sm font-bold text-tide-600">Step 1 of 2</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Create your account</h1>
            <p className="mt-2 text-muted">Six trackers, one place. It takes about a minute.</p>
            <form onSubmit={nextStep} className="mt-8 space-y-5">
              <AvatarPicker src={avatar?.url ?? null} name={name} onPick={(blob, url) => setAvatar({ blob, url })} />
              <div>
                <label htmlFor="name" className="label">Name</label>
                <input id="name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="email" className="label">Email</label>
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  aria-describedby="pw-hint"
                />
                <p id="pw-hint" className="mt-1.5 text-xs text-muted">At least 8 characters.</p>
              </div>
              {error && <p role="alert" className="notice-error">{error}</p>}
              <button type="submit" className="btn-primary w-full py-3.5 text-base">Continue</button>
            </form>
            <p className="mt-6 text-center text-sm text-muted">
              Already have an account?{' '}
              <Link href="/login" className="font-bold text-tide-600 hover:underline">Log in</Link>
            </p>
          </motion.div>
        )}

        {step === 'body' && (
          <motion.div key="body" {...slide}>
            <button type="button" onClick={() => setStep('account')} className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back
            </button>
            <p className="text-sm font-bold text-tide-600">Step 2 of 2</p>
            <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">A little about you</h1>
            <p className="mt-2 text-muted">We use this for your BMI and smart daily targets. You can change it any time in Profile.</p>
            <form onSubmit={createAccount} className="mt-8 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <HeightInput cm={heightCm} onChange={setHeightCm} />
                <WeightInput kg={weightKg} onChange={setWeightKg} />
              </div>
              <GenderPicker value={gender} onChange={setGender} />
              <BmiReadout heightCm={heightCm} weightKg={weightKg} />
              <ActivityPicker value={activity} onChange={setActivity} />
              {error && <p role="alert" className="notice-error">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Create account
              </button>
            </form>
          </motion.div>
        )}

        {step === 'verify' && (
          <motion.div key="verify" {...slide}>
            <VerifyCode
              email={email.trim()}
              type="signup"
              onVerified={async () => {
                const { data } = await supabase.auth.getUser()
                if (data.user) await finish(data.user.id)
              }}
              onResend={resendCode}
              onChangeEmail={() => {
                setError(null)
                setStep('account')
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
