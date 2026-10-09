import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/*
 * Email links (sign-up confirmation, magic link, email change, recovery)
 * land here.
 *
 * Current links carry ?token_hash=…&type=… (set in the Supabase email
 * templates). verifyOtp() checks the hash on the server, so the link works
 * in any browser or device: unlike the older ?code=… (PKCE) links, it doesn't
 * need the code verifier cookie from the browser that signed up, which is
 * why links opened elsewhere (or in an in-app mail browser) came back
 * "expired". On success the server client writes the session cookies, and
 * the redirect carries them.
 *
 * Older ?code=… links already sitting in inboxes still work.
 */

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
const isOtpType = (v: string | null): v is EmailOtpType => !!v && (OTP_TYPES as readonly string[]).includes(v)

/** Only same-site paths, so a crafted link can't bounce people to another site after confirming. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/dashboard'
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')
  const code = searchParams.get('code')
  const next = safeNext(searchParams.get('next'))
  const supabase = createClient()

  if (tokenHash && isOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) return NextResponse.redirect(new URL(next, origin))
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
  }

  // Expired, already used, or malformed: the login page explains and offers to log in.
  return NextResponse.redirect(new URL('/login?error=confirm', origin))
}
