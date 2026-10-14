import { useEffect, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { CODE_LENGTH, codeError, isNetworkError } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { COLORS, RADIUS } from '@/lib/theme'
import { Button, LinkButton, Notice } from './ui'

/* ------------------------------------------------------------------
 * "Enter the 6-digit code we sent you" (as on the website): one real
 * input, so paste and the keyboard's code suggestion from Mail just
 * work, drawn as six boxes. A full code submits itself.
 * ------------------------------------------------------------------ */

const RESEND_SECONDS = 60

export function CodeEntry({
  email,
  type,
  onVerified,
  onResend,
  onChangeEmail,
}: {
  email: string
  type: 'signup' | 'recovery'
  /** Called once the code is accepted (the person is now signed in). */
  onVerified: () => void
  /** Sends a new code; returns an error message, or null. */
  onResend: () => Promise<string | null>
  onChangeEmail: () => void
}) {
  const input = useRef<TextInput>(null)
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
    // A dropped connection (common after switching to Mail for the code) is retried
    // quietly: a request that never arrived didn't use the code up.
    let e: Parameters<typeof codeError>[0] | null = null
    let dropped = false
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, attempt * 1000))
      try {
        e = (await supabase.auth.verifyOtp({ email, token, type })).error
      } catch (err) {
        e = { name: 'NetworkError', message: err instanceof Error ? err.message : 'Network request failed' }
      }
      if (!e || !isNetworkError(e)) break
      dropped = true
    }
    // An earlier attempt may have got through with its answer lost: the code is then
    // used up, but that attempt already signed them in.
    if (e && dropped && !isNetworkError(e)) {
      const { data } = await supabase.auth.getSession()
      if (data.session?.user.email?.toLowerCase() === email.toLowerCase()) e = null
    }
    setBusy(false)
    if (e) {
      setError(codeError(e))
      // Keep the code after a connection problem so they can just try again; clear a wrong one.
      if (isNetworkError(e)) lastTried.current = ''
      else setCode('')
      input.current?.focus()
      return
    }
    onVerified()
  }

  function change(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH)
    setCode(digits)
    if (digits.length === CODE_LENGTH && digits !== lastTried.current) void verify(digits)
  }

  async function resend() {
    setError(null)
    setNotice(null)
    setWait(RESEND_SECONDS)
    const problem = await onResend()
    if (problem) setError(problem)
    else setNotice('New code sent. Only the newest code works.')
    lastTried.current = ''
    setCode('')
    input.current?.focus()
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title} accessibilityRole="header">
        {type === 'signup' ? 'Confirm your email' : 'Enter your code'}
      </Text>
      <Text style={styles.lead}>
        {type === 'signup' ? 'We sent' : 'If this email has an account, we sent'} a {CODE_LENGTH}-digit code to <Text style={styles.email}>{email}</Text>. Enter it below. It expires in 10 minutes.
      </Text>

      <Pressable onPress={() => input.current?.focus()} accessible={false} style={styles.boxes}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const current = i === code.length || (i === CODE_LENGTH - 1 && code.length === CODE_LENGTH)
          return (
            <View key={i} style={[styles.box, current && styles.boxCurrent]}>
              <Text style={styles.digit}>{code[i] ?? ''}</Text>
            </View>
          )
        })}
        {/* The real input, invisible over the boxes. */}
        <TextInput
          ref={input}
          value={code}
          onChangeText={change}
          autoFocus
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          caretHidden
          editable={!busy}
          accessibilityLabel={`${CODE_LENGTH}-digit code`}
          style={styles.hidden}
        />
      </Pressable>

      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="ok">{notice}</Notice>}

      <Button title="Continue" onPress={() => void verify(code)} busy={busy} disabled={code.length !== CODE_LENGTH} />

      <View style={styles.row}>
        {wait > 0 ? <Text style={styles.muted}>Send a new code in {wait}s</Text> : <LinkButton title="Send a new code" onPress={() => void resend()} />}
        <LinkButton title="Use a different email" onPress={onChangeEmail} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 16 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  lead: { fontSize: 16, lineHeight: 23, color: COLORS.muted, marginBottom: 8 },
  email: { fontWeight: '700', color: COLORS.ink },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: { flex: 1, aspectRatio: 0.85, maxHeight: 64, borderRadius: RADIUS.field, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  boxCurrent: { borderColor: COLORS.tide500, borderWidth: 2 },
  digit: { fontSize: 24, fontWeight: '700', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  hidden: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.011, color: 'transparent' },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 },
  muted: { fontSize: 14, color: COLORS.muted },
})
