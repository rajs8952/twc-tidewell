import { router } from 'expo-router'
import { Mail, MessageCircleHeart, Phone, PhoneCall } from 'lucide-react-native'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { PremiumCard } from '@/components/Support'
import { telHref, useContacts, type WellnessContact } from '@/lib/contacts'
import { COLORS, RADIUS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Support: the emergency number first (always, on every plan), then the
 * company's wellness team with their real details (Premium), as set by
 * admins on the website. A detail that isn't set yet isn't shown.
 * ------------------------------------------------------------------ */

export default function Support() {
  const contacts = useContacts()
  const emergency = contacts.emergency

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title} accessibilityRole="header">
          Support
        </Text>
        <Text style={styles.lead}>Help from your company’s wellness team, whenever you need it.</Text>

        <View style={styles.emergency}>
          <Text style={styles.emergencyTitle}>In danger right now?</Text>
          <Text style={styles.emergencyText}>If you or someone else is at risk of harm, call emergency services straight away.</Text>
          {emergency ? (
            <Pressable onPress={() => void Linking.openURL(telHref(emergency))} style={({ pressed }) => [styles.emergencyButton, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Call ${emergency}`}>
              <PhoneCall size={20} color="#0B2228" />
              <Text style={styles.emergencyButtonText}>Call {emergency}</Text>
            </Pressable>
          ) : (
            <Text style={styles.emergencyText}>Call your local emergency number.</Text>
          )}
        </View>

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
  const nothing = !c.phone && !c.email && !c.url && !chat
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.icon, { backgroundColor: `${c.accent}1F` }]}>
          <Icon size={22} color={c.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{c.name}</Text>
          <Text style={styles.cardText}>{c.description}</Text>
          {c.hours && <Text style={styles.hours}>{c.hours}</Text>}
        </View>
      </View>
      <View style={styles.actions}>
        {chat && <Action icon={MessageCircleHeart} label="Chat" primary onPress={() => router.push(`/chat/${c.id}`)} />}
        {c.phone && <Action icon={Phone} label={c.phone} onPress={() => void Linking.openURL(telHref(c.phone!))} a11y={`Call ${c.name}, ${c.phone}`} />}
        {c.email && <Action icon={Mail} label="Email" onPress={() => void Linking.openURL(`mailto:${c.email}`)} a11y={`Email ${c.name}, ${c.email}`} />}
        {nothing && <Text style={styles.cardText}>Details coming soon.</Text>}
      </View>
    </View>
  )
}

function Action({ icon: Icon, label, onPress, primary, a11y }: { icon: typeof Phone; label: string; onPress: () => void; primary?: boolean; a11y?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={a11y ?? label}>
      <Icon size={17} color={primary ? COLORS.white : COLORS.ink} />
      <Text style={[styles.actionText, primary && { color: COLORS.white }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginBottom: 6 },
  emergency: { borderRadius: RADIUS.card, backgroundColor: '#0B2228', padding: 18, gap: 8 },
  emergencyTitle: { fontSize: 19, fontWeight: '800', color: COLORS.white },
  emergencyText: { fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.9)' },
  emergencyButton: { marginTop: 6, minHeight: 50, borderRadius: RADIUS.pill, backgroundColor: COLORS.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  emergencyButtonText: { fontSize: 17, fontWeight: '800', color: '#0B2228' },
  card: { borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  cardText: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  hours: { marginTop: 2, fontSize: 13, fontWeight: '600', color: COLORS.ink },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  actionPrimary: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  actionText: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
})
