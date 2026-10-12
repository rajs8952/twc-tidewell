'use client'

import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { requestPasswordReset } from '@/app/actions/password'
import { AuthShell } from '@/components/AuthShell'
import { VerifyCode, codeError } from '@/components/auth/VerifyCode'
import { flushPendingAvatar } from '@/lib/avatar'
import { BRAND } from '@/lib/brand'
import { safePath } from '@/lib/safe-path'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Logging in; asking for a reset code, then entering it; or confirming an unconfirmed account with its code. */
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset-code' | 'confirm-code'>('login')
  /** Arrived from an invitation (/login?setup=1): the same code flow, worded as setting up a new account. */
  const [setup, setSetup] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('setup') === '1') {
      setSetup(true)
      setMode('forgot')
    }
    if (new URLSearchParams(window.location.search).get('error') === 'confirm') {
      setError('That email link has expired or was already used. Log in, or use “Forgot password?” to get a code.')
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setLoading(false)
      if (error.message.toLowerCase().includes('email not confirmed')) {
        // Never confirmed: send a fresh code and ask for it here.
        const problem = await resendSignupCode()
        if (problem) setError(problem)
        setMode('confirm-code')
      } else if (error.message === 'Invalid login credentials') {
        setError('That email and password don’t match an account.')
      } else {
        setError(error.message)
      }
      return
    }
    await flushPendingAvatar(supabase, data.user.id)
    const next = new URLSearchParams(window.location.search).get('next')
    router.replace(safePath(next))
    router.refresh()
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await requestPasswordReset(email)
      if (!res.ok) return setError(res.error)
      setMode('reset-code')
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function resendSignupCode() {
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: email.trim() })
    return e ? codeError(e) : null
  }

  async function resendResetCode() {
    try {
      const res = await requestPasswordReset(email)
      return res.ok ? null : res.error
    } catch {
      return 'Couldn’t reach the server. Check your connection and try again.'
    }
  }

  function switchTo(next: typeof mode) {
    setMode(next)
    setError(null)
  }

  if (mode !== 'login') {
    return (
      <AuthShell>
        <button type="button" onClick={() => switchTo('login')} className="flex w-fit items-center gap-1.5 text-sm font-bold text-tide-600 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to log in
        </button>
        {mode === 'reset-code' || mode === 'confirm-code' ? (
          <div className="mt-6">
            {mode === 'confirm-code' && error && (
              <p role="alert" className="notice-error mb-4">
                {error}
              </p>
            )}
            <VerifyCode
              email={email.trim()}
              type={mode === 'reset-code' ? 'recovery' : 'signup'}
              onVerified={async () => {
                if (mode === 'reset-code') {
                  // Signed in by the code: now choose the new password.
                  router.replace('/update-password')
                  return
                }
                const { data } = await supabase.auth.getUser()
                if (data.user) await flushPendingAvatar(supabase, data.user.id)
                router.replace(safePath(new URLSearchParams(window.location.search).get('next')))
                router.refresh()
              }}
              onResend={mode === 'reset-code' ? resendResetCode : resendSignupCode}
              onChangeEmail={() => switchTo(mode === 'reset-code' ? 'forgot' : 'login')}
            />
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">{setup ? 'Set up your account' : 'Forgot your password?'}</h1>
            <p className="mt-2 text-muted">
              {setup
                ? 'Enter the work email your invitation was sent to, and we’ll send you a 6-digit code to choose your password.'
                : 'Enter your email and we’ll send you a code to choose a new one.'}
            </p>
            <form onSubmit={onForgot} className="mt-8 space-y-4">
              <div>
                <label htmlFor="reset-email" className="label">Email</label>
                <input id="reset-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
              {error && <p role="alert" className="notice-error">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Send code
              </button>
            </form>
          </>
        )}
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1 className="text-3xl font-extrabold sm:text-4xl">Welcome back</h1>
      <p className="mt-2 text-muted">Log in to pick up where you left off.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
        </div>
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="password" className="label">Password</label>
            <button type="button" onClick={() => switchTo('forgot')} className="text-sm font-bold text-tide-600 hover:underline">
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-12"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:text-ink"
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p role="alert" className="notice-error">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Log in
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New to {BRAND.name}?{' '}
        <Link href="/signup" className="font-bold text-tide-600 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  )
}
