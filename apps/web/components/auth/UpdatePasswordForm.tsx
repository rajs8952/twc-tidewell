'use client'

import { CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { updatePassword } from '@/app/actions/password'
import { PASSWORD_MAX, PASSWORD_MIN } from '@/lib/admin'

/** New password, typed twice, saved through app/actions/password.ts (which checks the same rules). */
export function UpdatePasswordForm({ email }: { email: string }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const longEnough = password.length >= PASSWORD_MIN
  const matches = confirm.length > 0 && confirm === password

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!longEnough) return setError(`Use at least ${PASSWORD_MIN} characters.`)
    if (!matches) return setError('The two passwords don’t match.')
    setLoading(true)
    try {
      const res = await updatePassword(password, confirm)
      if (!res.ok) return setError(res.error)
      setPassword('')
      setConfirm('')
      setDone(true)
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div role="status">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">Password changed</h1>
        <p className="mt-2 text-muted">Use your new password next time you log in. You’re still logged in on this device.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard" className="btn-primary">Go to Home</Link>
          <Link href="/profile" className="btn-secondary">Back to Profile</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold sm:text-4xl">Choose a new password</h1>
      <p className="mt-2 text-muted">
        For <strong className="text-ink">{email}</strong>. Use at least {PASSWORD_MIN} characters; a short phrase is easy to remember and hard to guess.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
        <div>
          <label htmlFor="new-password" className="label">New password</label>
          <div className="relative">
            <input
              id="new-password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              required
              autoFocus
              maxLength={PASSWORD_MAX}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input pr-12"
              aria-describedby="new-password-hint"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:text-ink"
              aria-label={show ? 'Hide passwords' : 'Show passwords'}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p id="new-password-hint" className={`mt-1 text-xs ${longEnough ? 'text-emerald-700' : 'text-muted'}`}>
            {longEnough ? '✓ ' : ''}At least {PASSWORD_MIN} characters
          </p>
        </div>
        <div>
          <label htmlFor="confirm-password" className="label">Type it again</label>
          <input
            id="confirm-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            maxLength={PASSWORD_MAX}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="input"
            aria-describedby="confirm-hint"
          />
          {confirm.length > 0 && (
            <p id="confirm-hint" className={`mt-1 text-xs ${matches ? 'text-emerald-700' : 'text-alert'}`}>
              {matches ? '✓ Passwords match' : 'Passwords don’t match yet'}
            </p>
          )}
        </div>

        {error && <p role="alert" className="notice-error">{error}</p>}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3.5 text-base">
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Save new password
        </button>
        <p className="text-center text-sm text-muted">
          <Link href="/profile" className="font-bold text-tide-600 hover:underline">Cancel</Link>
        </p>
      </form>
    </>
  )
}
