import { router } from 'expo-router'
import { Clock, HeartHandshake, LifeBuoy, Mail, MessageCircleHeart, Phone, PhoneCall, ShieldCheck } from 'lucide-react-native'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { OfflineNotice } from '@/components/kit'
import { PremiumCard } from '@/components/Support'
import { telHref, useContacts, type WellnessContact } from '@/lib/contacts'
import { COLORS, RADIUS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Support: the emergency number first (always, on every plan, and
 * offline too), then the company's wellness team with their real
 * details (Premium), as set by admins on the website. A detail that
 * isn't set yet isn't shown.
 * ------------------------------------------------------------------ */

export default function Support() {
  const contacts = useContacts()
  const emergency = contacts.emergency
  const eap = contacts.locked ? null : contacts.byId.eap.phone

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="supportWash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#DFF0ED" />
              <Stop offset="0.6" stopColor="#E8F3FA" />
              <Stop offset="1" stopColor={COLORS.background} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#supportWash)" />
        </Svg>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.badge}>
          <ShieldCheck size={13} color="#237A70" />
          <Text style={styles.badgeText}>Confidential support</Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Support
        </Text>
        <Text style={styles.lead}>Help from your company’s wellness team, whenever you need it. What you share stays between you and them.</Text>
        <OfflineNotice />

        {/* Emergency: first, always. */}
        <View style={styles.emergency}>
          <View style={styles.stripe} />
          <View style={styles.emergencyBody}>
            <View style={styles.emergencyHead}>
              <View style={styles.lifebuoy}>
                <LifeBuoy size={22} color="#0B2228" />
              </View>
              <Text style={styles.emergencyTitle} accessibilityRole="header">
                In danger right now?
              </Text>
            </View>
            <Text style={styles.emergencyText}>If you or someone else is at risk of harm, call emergency services straight away.</Text>
            {emergency ? (
              <Pressable onPress={() => void Linking.openURL(telHref(emergency))} style={({ pressed }) => [styles.emergencyButton, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Call ${emergency}`}>
                <PhoneCall size={20} color="#0B2228" />
                <Text style={styles.emergencyButtonText}>Call {emergency}</Text>
              </Pressable>
            ) : (
              <Text style={styles.emergencyText}>Call your local emergency number.</Text>
            )}
            {eap && (
              <Pressable onPress={() => void Linking.openURL(telHref(eap))} style={styles.eapRow} accessibilityRole="button" accessibilityLabel={`Need someone to talk to? Call the EAP helpline, ${eap}`}>
                <HeartHandshake size={16} color="rgba(255,255,255,0.9)" />
                <Text style={styles.eapText}>
                  Need someone to talk to? <Text style={styles.eapLink}>Call the EAP helpline</Text>
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <Text style={styles.section} accessibilityRole="header">
          Your wellness team
        </Text>
        {contacts.locked ? (
          <PremiumCard title="Your wellness team" text="The Employee Assistance Programme helpline, and calling or chatting with your therapist and dietitian, are part of Premium." />
        ) : (
          contacts.team.map((c) => <ContactCard key={c.id} c={c} />)
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function ContactCard({ c }: { c: WellnessContact }) {
  const Icon = c.icon
  const chat = c.id === 'therapist' || c.id === 'dietitian'
  const actions = [
    ...(chat ? [{ key: 'chat', icon: MessageCircleHeart, label: 'Chat', a11y: `Chat with the ${c.name.toLowerCase()}`, onPress: () => router.push(`/chat/${c.id}`) }] : []),
    ...(c.phone ? [{ key: 'call', icon: Phone, label: 'Call', a11y: `Call ${c.name}, ${c.phone}`, onPress: () => void Linking.openURL(telHref(c.phone!)) }] : []),
    ...(c.email ? [{ key: 'email', icon: Mail, label: 'Email', a11y: `Email ${c.name}, ${c.email}`, onPress: () => void Linking.openURL(`mailto:${c.email}`) }] : []),
  ]
  return (
    <View style={styles.card}>
      <View style={[styles.accent, { backgroundColor: c.accent }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <View style={[styles.icon, { backgroundColor: `${c.accent}1F` }]}>
            <Icon size={24} color={c.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.cardTitle}>{c.name}</Text>
            <Text style={styles.cardText}>{c.description}</Text>
          </View>
        </View>
        {(c.phone || c.hours) && (
          <View style={styles.details}>
            {c.phone && (
              <View style={styles.detail}>
                <Phone size={13} color={COLORS.muted} />
                <Text style={styles.detailText}>{c.phone}</Text>
              </View>
            )}
            {c.hours && (
              <View style={styles.detail}>
                <Clock size={13} color={COLORS.muted} />
                <Text style={styles.detailText}>{c.hours}</Text>
              </View>
            )}
          </View>
        )}
        {actions.length ? (
          <View style={styles.actions}>
            {actions.map((a, i) => {
              const A = a.icon
              const primary = i === 0
              return (
                <Pressable
                  key={a.key}
                  onPress={a.onPress}
                  style={({ pressed }) => [styles.action, primary && { backgroundColor: c.accent, borderColor: c.accent }, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel={a.a11y}
                >
                  <A size={20} color={primary ? COLORS.white : c.accent} />
                  <Text style={[styles.actionText, primary && { color: COLORS.white }]}>{a.label}</Text>
                </Pressable>
              )
            })}
          </View>
        ) : (
          <Text style={styles.cardText}>Details coming soon.</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800', color: '#237A70' },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6, marginTop: -4 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginTop: -6 },
  emergency: { flexDirection: 'row', borderRadius: RADIUS.card, backgroundColor: '#0B2228', overflow: 'hidden', shadowColor: '#0B2228', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  stripe: { width: 6, backgroundColor: '#E5553C' },
  emergencyBody: { flex: 1, padding: 18, gap: 10 },
  emergencyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lifebuoy: { width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  emergencyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  emergencyText: { fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.9)' },
  emergencyButton: { minHeight: 54, borderRadius: RADIUS.pill, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 4 },
  emergencyButtonText: { fontSize: 18, fontWeight: '800', color: '#0B2228' },
  eapRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.25)' },
  eapText: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  eapLink: { fontWeight: '800', color: COLORS.white, textDecorationLine: 'underline' },
  section: { marginTop: 6, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  card: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden', shadowColor: '#0F2F37', shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1 },
  accent: { width: 5 },
  cardBody: { flex: 1, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  cardText: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailText: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 60, borderRadius: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '800', color: COLORS.ink },
})
