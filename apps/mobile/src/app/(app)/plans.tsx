import { PREMIUM_FEATURES, PRICES, type BillingPeriod } from '@omniwell/web/plans'
import { useFocusEffect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { Check, Crown, ShieldCheck } from 'lucide-react-native'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { Card, Muted, TrackerScreen } from '@/components/kit'
import { Button, Notice } from '@/components/ui'
import { daysLeft, loadPlan, type PlanInfo } from '@/lib/plan'
import { COLORS, RADIUS } from '@/lib/theme'
import { messageOf } from '@/lib/trackers'
import { callWebsite } from '@/lib/website'

/* ------------------------------------------------------------------
 * Premium: what it adds, monthly or yearly, and paying on Razorpay's own
 * page (opened here; card details are never typed into the app). When
 * the page closes, or the app comes back to the front, we ask the website
 * to check with Razorpay and switch Premium on (the webhook does too).
 * A paid plan can stop renewing here; Premium lasts to the end of the period.
 * ------------------------------------------------------------------ */

const GOLD = '#B9650E'
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) : '')

export default function Plans() {
  const [plan, setPlan] = useState<PlanInfo | null>(null)
  const [period, setPeriod] = useState<BillingPeriod>('yearly')
  const [busy, setBusy] = useState<'pay' | 'check' | 'cancel' | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [testMode, setTestMode] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const waitingRef = useRef(false)

  const refresh = useCallback(async () => setPlan(await loadPlan()), [])
  useFocusEffect(
    useCallback(() => {
      refresh().catch((e) => setNote({ tone: 'error', text: messageOf(e) }))
    }, [refresh]),
  )

  /** Asks the website to check the payment with Razorpay. Quiet unless asked, or once it's paid. */
  const check = useCallback(
    async (asked: boolean) => {
      if (asked) setBusy('check')
      try {
        const r = await callWebsite<{ premium: boolean; premiumUntil: string | null }>('/api/mobile/billing', { action: 'sync' })
        if (r.premium) {
          waitingRef.current = false
          setWaiting(false)
          await refresh()
          setNote({ tone: 'ok', text: 'Payment received. Premium is on. Thank you!' })
        } else if (asked) {
          setNote({ tone: 'error', text: 'We haven’t received the payment yet. If you’ve just paid, wait a few seconds and check again.' })
        }
      } catch (e) {
        if (asked) setNote({ tone: 'error', text: messageOf(e) })
      } finally {
        if (asked) setBusy(null)
      }
    },
    [refresh],
  )

  // Coming back from the payment page (Android returns to the app this way).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && waitingRef.current) void check(false)
    })
    return () => sub.remove()
  }, [check])

  async function pay() {
    setNote(null)
    setBusy('pay')
    try {
      const r = await callWebsite<{ url: string; testMode: boolean }>('/api/mobile/billing', { action: 'checkout', period })
      setTestMode(r.testMode)
      waitingRef.current = true
      setWaiting(true)
      setBusy(null)
      await WebBrowser.openBrowserAsync(r.url, { dismissButtonStyle: 'close', presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
      // iOS: the page has been closed.
      await check(false)
    } catch (e) {
      setNote({ tone: 'error', text: messageOf(e) })
      setBusy(null)
    }
  }

  function cancel() {
    Alert.alert('Stop renewing Premium?', `Nothing more will be charged. You keep Premium until ${day(plan?.premium_until)}.`, [
      { text: 'Keep Premium', style: 'cancel' },
      {
        text: 'Stop renewing',
        style: 'destructive',
        onPress: () => {
          setBusy('cancel')
          setNote(null)
          callWebsite('/api/mobile/billing', { action: 'cancel' })
            .then(refresh)
            .then(() => setNote({ tone: 'ok', text: 'Renewal stopped. Premium continues until the end of the period you paid for.' }))
            .catch((e) => setNote({ tone: 'error', text: messageOf(e) }))
            .finally(() => setBusy(null))
        },
      },
    ])
  }

  const left = plan?.source === 'trial' ? daysLeft(plan.premium_until) : null
  const paid = plan?.premium && plan.source === 'paid'
  const provided = plan?.premium && (plan.staff || plan.source === 'company' || plan.source === 'grandfathered' || plan.source === 'admin')
  const canBuy = plan && !provided && !(paid && plan.status === 'active')

  return (
    <TrackerScreen title="Premium">
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Crown size={26} color={GOLD} />
        </View>
        <Text style={styles.heroTitle}>OmniWell Premium</Text>
        <Text style={styles.heroText}>
          {provided
            ? plan?.staff
              ? 'You have Premium as part of the wellness team.'
              : 'You have Premium, provided by your company. There’s nothing to pay.'
            : paid
              ? plan?.status === 'cancelled' || plan?.cancel_at_period_end
                ? `You have Premium until ${day(plan?.premium_until)}. It won’t renew.`
                : `You’re on Premium ${plan?.billing_period === 'yearly' ? 'yearly' : 'monthly'}. It renews on ${day(plan?.premium_until)}.`
              : plan?.source === 'trial' && plan.premium
                ? `Your free trial has ${left} ${left === 1 ? 'day' : 'days'} left. Keep Premium after it ends:`
                : 'The people, the guidance and the reminders, on top of the free trackers.'}
        </Text>
      </View>

      {note && <Notice tone={note.tone}>{note.text}</Notice>}

      <Card>
        {PREMIUM_FEATURES.map((f) => (
          <View key={f.key} style={styles.feature}>
            <View style={styles.tick}>
              <Check size={14} color={COLORS.white} strokeWidth={3} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureText}>{f.text}</Text>
            </View>
          </View>
        ))}
      </Card>

      {canBuy && (
        <>
          <View style={styles.periods}>
            {(['monthly', 'yearly'] as const).map((p) => {
              const price = PRICES[p]
              const on = period === p
              return (
                <Pressable key={p} onPress={() => setPeriod(p)} style={[styles.period, on && styles.periodOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${price.label} a ${price.per}`}>
                  {p === 'yearly' && (
                    <View style={styles.save}>
                      <Text style={styles.saveText}>Save 50%</Text>
                    </View>
                  )}
                  <Text style={styles.periodName}>{p === 'monthly' ? 'Monthly' : 'Yearly'}</Text>
                  <Text style={styles.periodPrice}>
                    {price.label}
                    <Text style={styles.periodPer}> / {price.per}</Text>
                  </Text>
                  <Text style={styles.periodNote}>{p === 'yearly' ? 'About ₹50 a month' : 'Cancel any time'}</Text>
                </Pressable>
              )
            })}
          </View>
          <Button title={busy === 'pay' ? 'Opening Razorpay…' : 'Continue to payment'} onPress={() => void pay()} busy={busy === 'pay'} disabled={!!busy} />
          {waiting && <Button title="I’ve paid, check now" variant="secondary" onPress={() => void check(true)} busy={busy === 'check'} disabled={!!busy && busy !== 'check'} />}
          <View style={styles.secure}>
            <ShieldCheck size={15} color={COLORS.muted} />
            <Muted style={{ flex: 1, fontSize: 13 }}>Paid securely on Razorpay’s own page. Prices include taxes. Renews automatically; stop it here any time.</Muted>
          </View>
          {testMode && (
            <Notice tone="ok">Test mode: no real money is taken. Pay with one of Razorpay’s test cards or test UPI IDs (razorpay.com/docs → Test card details).</Notice>
          )}
        </>
      )}

      {paid && plan?.status === 'active' && !plan.cancel_at_period_end && <Button title="Stop renewing" variant="secondary" onPress={cancel} busy={busy === 'cancel'} disabled={!!busy} />}
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6, borderRadius: RADIUS.card, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5D9A3', padding: 22 },
  heroIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { marginTop: 4, fontSize: 24, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.4 },
  heroText: { fontSize: 15, lineHeight: 21, color: COLORS.muted, textAlign: 'center' },
  feature: { flexDirection: 'row', gap: 12, paddingVertical: 6 },
  tick: { marginTop: 2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#2E9C8F', alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  featureText: { fontSize: 13, lineHeight: 18, color: COLORS.muted },
  periods: { flexDirection: 'row', gap: 10 },
  period: { flex: 1, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.white, padding: 14, gap: 2 },
  periodOn: { borderColor: GOLD, backgroundColor: '#FFFBF3' },
  periodName: { fontSize: 13, fontWeight: '800', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  periodPrice: { fontSize: 24, fontWeight: '800', color: COLORS.ink },
  periodPer: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  periodNote: { fontSize: 12, color: COLORS.muted },
  save: { position: 'absolute', top: -10, right: 10, borderRadius: RADIUS.pill, backgroundColor: GOLD, paddingHorizontal: 8, paddingVertical: 3 },
  saveText: { fontSize: 11, fontWeight: '800', color: COLORS.white },
  secure: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
})
