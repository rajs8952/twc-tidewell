import type { Intervention, InterventionAction } from '@rajs8952/interventions'
import { router, type Href } from 'expo-router'
import { CalendarCheck, Crown, Lightbulb, LifeBuoy, MessageCircleHeart, Phone, TriangleAlert, X } from 'lucide-react-native'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { telHref, useContacts, type Contacts } from '@/lib/contacts'
import { COLORS, RADIUS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * The support prompts, as on the website (components/interventions/
 * InterventionBanner.tsx): a full-screen crisis prompt for CRITICAL
 * (no close button: "I’m okay for now" acknowledges it), an inline banner
 * for WARNING and SUGGESTION. Only actions with real contact details
 * become buttons; on the Free plan the emergency number is always there.
 * ------------------------------------------------------------------ */

/** Where an action goes: a phone call, the team's chat in the app, or a link/email. */
function actionTarget(a: InterventionAction, contacts: Contacts): { kind: 'call' | 'chat' | 'link'; to: string } | null {
  if (a.kind === 'open') return a.href ? { kind: 'chat', to: a.href } : null
  if (!a.contact || contacts.locked) return null
  if (a.kind !== 'call' && (a.contact === 'therapist' || a.contact === 'dietitian')) return { kind: 'chat', to: `/chat/${a.contact}` }
  const c = contacts.byId[a.contact]
  if (a.kind === 'call') return c.phone ? { kind: 'call', to: telHref(c.phone) } : null
  const to = c.url ?? (c.email ? `mailto:${c.email}` : null) ?? (c.phone ? telHref(c.phone) : null)
  return to ? { kind: 'link', to } : null
}

function go(t: { kind: 'call' | 'chat' | 'link'; to: string }) {
  if (t.kind === 'chat') router.push(t.to as Href)
  else void Linking.openURL(t.to)
}

const ACTION_ICON = { call: Phone, chat: MessageCircleHeart, book: CalendarCheck, open: MessageCircleHeart } as const

/** CRITICAL: the crisis prompt. */
export function CrisisPrompt({ intervention, onAcknowledge }: { intervention: Intervention | null; onAcknowledge: () => void }) {
  const contacts = useContacts()
  if (!intervention) return null
  const actions = intervention.actions.map((a) => ({ a, t: actionTarget(a, contacts) })).filter((x) => x.t)
  const eap = contacts.locked ? null : contacts.byId.eap.phone
  const emergency = contacts.emergency
  const message = contacts.locked && emergency ? `It sounds like today is really hard. You don’t have to face it alone: if you’re in danger or thinking about harming yourself, call ${emergency} now.` : intervention.message

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      {/* A pop-up over a dimmed screen. No close button or tap-outside: "I’m okay for now" acknowledges it. */}
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.backdrop} edges={['top', 'bottom', 'left', 'right']}>
          <View style={styles.crisis} accessibilityViewIsModal>
            <View style={styles.crisisStripe} />
            <ScrollView contentContainerStyle={styles.crisisBody} bounces={false}>
              <View style={styles.crisisHead}>
                <View style={styles.crisisIcon}>
                  <LifeBuoy size={22} color="#0B2228" />
                </View>
                <Text style={styles.crisisTitle} accessibilityRole="header">
                  {intervention.title}
                </Text>
              </View>
              <Text style={styles.crisisText}>{message}</Text>

              <View style={styles.helpline}>
                {eap || emergency ? (
                  <>
                    <Text style={styles.helplineLabel}>{eap ? 'EAP crisis helpline' : 'Emergency services'}</Text>
                    <Pressable onPress={() => void Linking.openURL(telHref((eap ?? emergency)!))} accessibilityRole="link" accessibilityLabel={`Call ${eap ?? emergency}`}>
                      <Text style={styles.helplineNumber}>{eap ?? emergency}</Text>
                    </Pressable>
                    <Text style={styles.helplineNote}>In immediate danger? Call {emergency ?? 'your local emergency number'} now.</Text>
                  </>
                ) : (
                  <Text style={styles.helplineNumber}>If you’re in danger right now, call your local emergency number.</Text>
                )}
              </View>

              <View style={{ gap: 8 }}>
                {actions.map(({ a, t }, i) => {
                  const Icon = ACTION_ICON[a.kind]
                  return (
                    <Pressable
                      key={a.label}
                      onPress={() => {
                        if (t!.kind === 'chat') onAcknowledge()
                        go(t!)
                      }}
                      style={({ pressed }) => [styles.crisisButton, i === 0 ? styles.crisisPrimary : styles.crisisSecondary, pressed && { opacity: 0.85 }]}
                      accessibilityRole="button"
                    >
                      <Icon size={20} color={i === 0 ? '#0B2228' : COLORS.white} />
                      <Text style={[styles.crisisButtonText, i === 0 && { color: '#0B2228' }]}>{a.label}</Text>
                    </Pressable>
                  )
                })}
                {actions.length === 0 && emergency && (
                  <Pressable onPress={() => void Linking.openURL(telHref(emergency))} style={[styles.crisisButton, styles.crisisPrimary]} accessibilityRole="button">
                    <Phone size={20} color="#0B2228" />
                    <Text style={[styles.crisisButtonText, { color: '#0B2228' }]}>Call {emergency}</Text>
                  </Pressable>
                )}
              </View>

              <Pressable onPress={onAcknowledge} style={styles.okay} accessibilityRole="button">
                <Text style={styles.okayText}>I’m okay for now</Text>
              </Pressable>
            </ScrollView>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  )
}

const TONE = {
  WARNING: { label: 'Heads up', icon: TriangleAlert, bg: '#FFF7E6', border: '#F5D9A3', fg: '#8A5A0B' },
  SUGGESTION: { label: 'Suggestion', icon: Lightbulb, bg: COLORS.tide50, border: COLORS.tide200, fg: COLORS.tide700 },
} as const

/** WARNING / SUGGESTION: a gentle banner with one action. */
export function SupportBanner({ intervention, onDismiss }: { intervention: Intervention; onDismiss: () => void }) {
  const contacts = useContacts()
  if (intervention.severity !== 'WARNING' && intervention.severity !== 'SUGGESTION') return null
  const tone = TONE[intervention.severity]
  const Icon = tone.icon
  const first = intervention.actions[0]
  const t = first ? actionTarget(first, contacts) : null
  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]} accessibilityRole="summary">
      <View style={styles.bannerHead}>
        <Icon size={18} color={tone.fg} />
        <Text style={[styles.bannerTag, { color: tone.fg }]}>{tone.label}</Text>
        <Pressable onPress={onDismiss} hitSlop={10} style={{ marginLeft: 'auto' }} accessibilityRole="button" accessibilityLabel="Dismiss">
          <X size={18} color={COLORS.muted} />
        </Pressable>
      </View>
      <Text style={styles.bannerTitle}>{intervention.title}</Text>
      <Text style={styles.bannerText}>{intervention.message}</Text>
      {first && t && (
        <Pressable onPress={() => go(t)} style={({ pressed }) => [styles.bannerButton, pressed && { opacity: 0.8 }]} accessibilityRole="button">
          <MessageCircleHeart size={18} color={COLORS.white} />
          <Text style={styles.bannerButtonText}>{first.label}</Text>
        </Pressable>
      )}
    </View>
  )
}

/** What a Premium feature adds, for Free accounts. No prices or purchase links in the app (store rules). */
export function PremiumCard({ title, text }: { title: string; text: string }) {
  return (
    <View style={styles.premium}>
      <View style={styles.premiumIcon}>
        <Crown size={22} color="#B9650E" />
      </View>
      <Text style={styles.premiumTitle}>{title}</Text>
      <Text style={styles.premiumText}>{text}</Text>
      <Text style={styles.premiumNote}>Premium isn’t active on your account. If your company provides OmniWell, ask your HR team about it. The emergency number is always free.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7,26,31,0.75)', justifyContent: 'center', padding: 16 },
  crisis: { maxHeight: '100%', width: '100%', maxWidth: 440, alignSelf: 'center', borderRadius: 24, backgroundColor: '#0B2228', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  crisisStripe: { height: 6, backgroundColor: '#E5553C' },
  crisisBody: { padding: 20, gap: 14 },
  crisisHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  crisisIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  crisisTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: COLORS.white, lineHeight: 25 },
  crisisText: { fontSize: 15, lineHeight: 22, color: 'rgba(255,255,255,0.92)' },
  helpline: { borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  helplineLabel: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  helplineNumber: { fontSize: 24, fontWeight: '800', color: COLORS.white, textDecorationLine: 'underline' },
  helplineNote: { fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  crisisButton: { minHeight: 48, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  crisisPrimary: { backgroundColor: COLORS.white },
  crisisSecondary: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  crisisButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  okay: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  okayText: { fontSize: 15, fontWeight: '700', color: 'rgba(255,255,255,0.9)', textDecorationLine: 'underline' },
  banner: { borderRadius: RADIUS.card, borderWidth: 1, padding: 16, gap: 6 },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerTag: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  bannerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  bannerText: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  bannerButton: { marginTop: 6, alignSelf: 'flex-start', minHeight: 42, borderRadius: RADIUS.pill, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  bannerButtonText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  premium: { borderRadius: RADIUS.card, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: '#F5D9A3', padding: 20, gap: 8 },
  premiumIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  premiumTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  premiumText: { fontSize: 15, lineHeight: 21, color: COLORS.ink },
  premiumNote: { fontSize: 13, lineHeight: 19, color: COLORS.muted },
})
