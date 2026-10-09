import { NextResponse } from 'next/server'
import { Webhook } from 'standardwebhooks'
import { EmailNotConfiguredError, layout, sendEmail } from '@/lib/email'

/*
 * Supabase "Send Email Hook": Supabase calls this instead of sending auth
 * emails itself, and OmniWell sends them through its own mailer
 * (lib/email.ts: Gmail/SMTP via Nodemailer). Set up in Supabase →
 * Authentication → Hooks → Send Email → HTTPS, pointing here, with its
 * secret saved in Vercel as SEND_EMAIL_HOOK_SECRET.
 *
 * Every request is signed by Supabase (Standard Webhooks); anything without
 * a valid, recent signature is refused, so nobody else can make OmniWell send
 * email. Links go to /auth/callback with a token_hash, which the callback
 * verifies (app/auth/callback/route.ts).
 */

export const dynamic = 'force-dynamic'

const PROD = 'https://omniwell-app.vercel.app'

interface HookPayload {
  user: { email: string; new_email?: string; user_metadata?: { full_name?: string } }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

/** The site to link back to: the app the request came from (production or local), else production. */
function siteFrom(redirectTo: string, siteUrl: string) {
  for (const candidate of [redirectTo, siteUrl]) {
    try {
      const { origin } = new URL(candidate)
      if (origin === PROD || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin
    } catch {
      /* not a URL */
    }
  }
  return PROD
}

/** A same-site ?next= carried over from the redirect URL (e.g. /update-password). */
function nextFrom(redirectTo: string) {
  try {
    const next = new URL(redirectTo).searchParams.get('next')
    return next && next.startsWith('/') && !next.startsWith('//') ? next : null
  } catch {
    return null
  }
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status })
}

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret) return fail(500, 'Email hook isn’t configured on the server (SEND_EMAIL_HOOK_SECRET).')

  // Verify Supabase's signature on the exact body it sent.
  const body = await request.text()
  let payload: HookPayload
  try {
    const wh = new Webhook(secret.replace(/^v1,whsec_/, ''))
    payload = wh.verify(body, Object.fromEntries(request.headers)) as HookPayload
  } catch {
    return fail(401, 'Invalid signature.')
  }

  const { user, email_data: d } = payload
  const type = d.email_action_type
  const site = siteFrom(d.redirect_to, d.site_url)
  const next = nextFrom(d.redirect_to)
  const link = (hash: string, linkType: string) =>
    `${site}/auth/callback?token_hash=${encodeURIComponent(hash)}&type=${encodeURIComponent(linkType)}${next ? `&next=${encodeURIComponent(next)}` : ''}`
  const name = user.user_metadata?.full_name?.trim().split(/\s+/)[0]
  const hi = name ? `Hi ${name},` : 'Hi,'

  let subject: string
  let content: Parameters<typeof layout>[0]
  switch (type) {
    case 'signup':
      subject = 'Confirm your OmniWell account'
      content = {
        heading: 'Confirm your email',
        paragraphs: [hi, 'Welcome to OmniWell. Confirm your email address to finish setting up your account.'],
        button: { label: 'Confirm email', url: link(d.token_hash, 'signup') },
        footer: 'If you didn’t sign up for OmniWell, you can ignore this email.',
      }
      break
    case 'recovery':
      subject = 'Reset your OmniWell password'
      content = {
        heading: 'Reset your password',
        paragraphs: [hi, 'We received a request to reset the password for your OmniWell account. The link works once and expires in about an hour.'],
        button: { label: 'Choose a new password', url: link(d.token_hash, 'recovery') },
        footer: 'If you didn’t ask for this, you can ignore this email. Your password won’t change.',
      }
      break
    case 'magiclink':
      subject = 'Your OmniWell login link'
      content = {
        heading: 'Log in to OmniWell',
        paragraphs: [hi, 'Use this link to log in. It works once and expires in about an hour.'],
        button: { label: 'Log in', url: link(d.token_hash, 'magiclink') },
        footer: 'If you didn’t ask for this, you can ignore this email.',
      }
      break
    case 'invite':
      subject = 'You’re invited to OmniWell'
      content = {
        heading: 'You’re invited to OmniWell',
        paragraphs: [hi, 'You’ve been invited to OmniWell, your company’s wellbeing app. Accept the invite to set up your account.'],
        button: { label: 'Accept invite', url: link(d.token_hash, 'invite') },
        footer: 'If you weren’t expecting this, you can ignore this email.',
      }
      break
    case 'reauthentication':
      subject = 'Your OmniWell verification code'
      content = {
        heading: 'Your verification code',
        paragraphs: [hi, `Enter this code in OmniWell to confirm it’s you: ${d.token}`, 'It expires in a few minutes.'],
        footer: 'If you didn’t ask for this, someone may be trying to use your account. Change your password.',
      }
      break
    default:
      // OmniWell doesn't let people change their email address, so email_change (and anything new) isn't sent.
      return fail(400, `OmniWell doesn’t send “${type}” emails.`)
  }

  try {
    await sendEmail({ to: user.email, subject, ...layout(content) })
  } catch (e) {
    console.error('[send-email hook]', type, (e as Error).message)
    return fail(500, e instanceof EmailNotConfiguredError ? 'Email isn’t configured on the server.' : 'Couldn’t send the email. Try again in a moment.')
  }
  return NextResponse.json({})
}
