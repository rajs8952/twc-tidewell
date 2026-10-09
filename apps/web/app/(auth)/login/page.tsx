'use client'

import { ArrowLeft, Eye, EyeOff, Loader2, MailCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { requestPasswordReset } from '@/app/actions/password'
import { AuthShell } from '@/components/AuthShell'
import { flushPendingAvatar } from '@/lib/avatar'
import { BRAND } from '@/lib/brand'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Logging in, asking for a reset link, or told the link is on its way. */
  const [mode, setMode] = useState<'login' | 'forgot' | 'sent'>('login')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'confirm') {
      setError('That email link has expired or was already used. Log in, or ask for a new link.')
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
        setError('Confirm your email first. Check your inbox for the link we sent.')
      } else if (error.message === 'Invalid login credentials') {
        setError('That email and password don’t match an account.')
      } else {
        setError(error.message)
      }
      return
    }
    await flushPendingAvatar(supabase, data.user.id)
    const next = new URLSearchParams(window.location.search).get('next')
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard')
    router.refresh()
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await requestPasswordReset(email)
      if (!res.ok) return setError(res.error)
      setMode('sent')
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
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
        {mode === 'sent' ? (
          <div className="mt-6" role="status">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tide-50 text-tide-600">
              <MailCheck className="h-6 w-6" aria-hidden />
            </span>
            <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">Check your inbox</h1>
            <p className="mt-2 text-muted">
              If <strong className="text-ink">{email.trim()}</strong> has a {BRAND.name} account, we’ve sent it a link to choose a new password. It works once and expires in an hour.
            </p>
            <p className="mt-4 text-sm text-muted">No email after a few minutes? Check your spam folder, or ask your admin to reset it for you.</p>
            <button type="button" onClick={() => switchTo('forgot')} className="btn-secondary mt-6">
              Send another link
            </button>
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">Forgot your password?</h1>
            <p className="mt-2 text-muted">Enter your email and we’ll send you a link to choose a new one.</p>
            <form onSubmit={onForgot} className="mt-8 space-y-4">
              <div>
                <label htmlFor="reset-email" className="label">Email</label>
                <input id="reset-email" type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
              {error && <p role="alert" className="notice-error">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Send reset link
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
