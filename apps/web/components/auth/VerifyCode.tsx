'use client'

import { Loader2, MailCheck } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------
 * "Enter the 6-digit code we sent you": confirms a new account or a
 * password reset. A code (instead of a link) works on any device, and
 * company email scanners that open links in advance can't use it up.
 *
 * One real input (so paste, autofill from the Mail app and screen
 * readers just work), drawn as six boxes. A full code submits itself.
 * ------------------------------------------------------------------ */

export const CODE_LENGTH = 6
const RESEND_SECONDS = 60

/** Supabase's errors, in plain words. */
export function codeError(e: { code?: string; message: string; status?: number }) {
  const m = e.message.toLowerCase()
  if (e.code === 'otp_expired' || m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Check it, or send a new one.'
  if (e.status === 429 || m.includes('rate limit') || m.includes('security purposes')) return 'Too many tries just now. Wait a minute and try again.'
  return e.message
}

export function VerifyCode({
  email,
  type,
  onVerified,
  onResend,
  onChangeEmail,
}: {
  email: string
  type: 'signup' | 'recovery'
  /** Called once the code is accepted (the person is now signed in). */
  onVerified: () => void | Promise<void>
  /** Sends a new code; returns an error message, or null. */
  onResend: () => Promise<string | null>
  onChangeEmail: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [wait, setWait] = useState(RESEND_SECONDS)
  const lastTried = useRef('')

  useEffect(() => {
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function verify(token: string) {
    if (token.length !== CODE_LENGTH || busy) return
    lastTried.current = token
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: e } = await supabase.auth.verifyOtp({ email, token, type })
    if (e) {
      setBusy(false)
      setError(codeError(e))
      setCode('')
      inputRef.current?.focus()
      return
    }
    await onVerified()
  }

  // A complete code submits itself (typed, pasted or autofilled), once per code.
  useEffect(() => {
    if (code.length === CODE_LENGTH && code !== lastTried.current) void verify(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  async function resend() {
    setError(null)
    setNotice(null)
    setWait(RESEND_SECONDS)
    const problem = await onResend()
    if (problem) setError(problem)
    else setNotice('New code sent. Only the newest code works.')
    lastTried.current = ''
    setCode('')
    inputRef.current?.focus()
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void verify(code)
  }

  return (
    <div>
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-tide-50 text-tide-600">
        <MailCheck className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-4 text-3xl font-extrabold sm:text-4xl">{type === 'signup' ? 'Confirm your email' : 'Enter your code'}</h1>
      <p className="mt-2 text-muted">
        {type === 'signup' ? 'We sent' : 'If this email has an account, we sent'} a {CODE_LENGTH}-digit code to <strong className="text-ink">{email}</strong>. Enter it below. It
        expires in 10 minutes.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label htmlFor={id} className="label">
          {CODE_LENGTH}-digit code
        </label>
        <div className="relative" onClick={() => inputRef.current?.focus()}>
          {/* The boxes are drawn; the input on top does the work. */}
          <div className="grid grid-cols-6 gap-2" aria-hidden>
            {Array.from({ length: CODE_LENGTH }, (_, i) => {
              const active = i === Math.min(code.length, CODE_LENGTH - 1)
              return (
                <div
                  key={i}
                  className={`flex h-14 items-center justify-center rounded-2xl bg-white font-display text-2xl font-extrabold ring-1 transition sm:h-16 ${
                    error ? 'ring-2 ring-[#C42B1C]' : active ? 'ring-2 ring-tide-600' : 'ring-line'
                  }`}
                >
                  {code[i] ?? ''}
                </div>
              )
            })}
          </div>
          <input
            ref={inputRef}
            id={id}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern={`\\d{${CODE_LENGTH}}`}
            maxLength={CODE_LENGTH}
            autoFocus
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={`${id}-help`}
            className="absolute inset-0 h-full w-full cursor-text opacity-0"
          />
        </div>
        <p id={`${id}-help`} className="text-xs text-muted">
          Can’t find it? Check your spam folder. The email is from OmniWell.
        </p>

        {error && (
          <p role="alert" className="notice-error">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="notice-ok">
            {notice}
          </p>
        )}

        <button type="submit" disabled={busy || code.length !== CODE_LENGTH} className="btn-primary w-full py-3.5 text-base">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {type === 'signup' ? 'Confirm' : 'Continue'}
        </button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" onClick={resend} disabled={wait > 0} className="font-bold text-tide-600 hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline">
          {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
        </button>
        <button type="button" onClick={onChangeEmail} className="font-bold text-muted hover:text-ink">
          Wrong email?
        </button>
      </div>
    </div>
  )
}
