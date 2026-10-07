'use client'

import { Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
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

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error') === 'confirm') {
      setError('That confirmation link has expired or was already used. Log in, or sign up again for a new link.')
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
          <label htmlFor="password" className="label">Password</label>
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
