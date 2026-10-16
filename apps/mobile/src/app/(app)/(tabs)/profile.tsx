import { ageFromBirthYear, bmi } from '@rajs8952/core/biometrics'
import { goalsOf } from '@rajs8952/core/goals'
import { ACTIVITY_LEVELS, GENDERS, effectiveGoal, formatMl } from '@rajs8952/core/hydration'
import Constants from 'expo-constants'
import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { Activity, BellRing, Cake, Camera, ChevronRight, Crown, KeyRound, LogOut, Pencil, Ruler, Scale, UserRound, type LucideIcon } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { Status, TrackerScreen } from '@/components/kit'
import { Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { useSession } from '@/lib/auth'
import { CAN_UPGRADE_IN_APP, clearPlan, daysLeft, usePlan } from '@/lib/plan'
import { clearProfile, useProfile } from '@/lib/profile'
import { disablePush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS, messageOf, storage } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Me: your profile at a glance (photo, name, plan, body details, water
 * goal, personal goals), Edit profile, and Log out. There's no typing on
 * this tab: editing opens its own screen (../edit-profile.tsx).
 * ------------------------------------------------------------------ */

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)

export default function Me() {
  const { session } = useSession()
  const { profile, setProfile, error } = useProfile()
  const plan = usePlan()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [hero, setHero] = useState({ w: 0, h: 0 })

  if (!profile) {
    return <TrackerScreen edges={['top']}>{error ? <Notice tone="error">{error}</Notice> : <Loader label="Loading your profile…" />}</TrackerScreen>
  }

  const me = profile
  const left = plan?.source === 'trial' ? daysLeft(plan.premium_until) : null
  const planLine = !plan ? '' : plan.staff ? 'Premium · wellness team' : plan.premium ? (plan.source === 'trial' ? `Premium trial · ${left} ${left === 1 ? 'day' : 'days'} left` : plan.source === 'company' ? 'Premium · from your company' : 'Premium') : 'Free plan'
  const goals = goalsOf(me)
  const age = ageFromBirthYear(me.birth_year)
  const value = bmi(me.height_cm, me.weight_kg)
  const initials = me.full_name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?'

  const stats = [
    { label: 'Height', value: me.height_cm ? `${me.height_cm}` : '—', unit: me.height_cm ? 'cm' : '', icon: Ruler },
    { label: 'Weight', value: `${me.weight_kg}`, unit: 'kg', icon: Scale },
    { label: 'BMI', value: value ? String(value) : '—', unit: '', icon: Activity },
  ]
  const details: { label: string; value: string; icon: LucideIcon }[] = [
    { label: 'Age', value: age != null ? `${age} years` : 'Not set', icon: Cake },
    { label: 'Sex', value: GENDERS.find((g) => g.id === me.gender)?.label ?? 'Not set', icon: UserRound },
    { label: 'Activity level', value: ACTIVITY_LEVELS.find((a) => a.id === me.activity_level)?.label ?? 'Not set', icon: Activity },
  ]
  const targets = [
    { id: 'water' as const, value: formatMl(effectiveGoal(me)), per: me.custom_goal_ml != null ? 'a day · your own' : 'a day' },
    { id: 'sleep' as const, value: fmtMin(goals.sleepMin), per: 'a night' },
    { id: 'meditation' as const, value: `${goals.meditationMin} min`, per: 'a day' },
    { id: 'exercise' as const, value: `${goals.exerciseWeekMin} min`, per: 'a week' },
  ]
  const version = Constants.expoConfig?.version

  /** A new photo: cropped square, shrunk to 512 px, uploaded to the avatars bucket (as the website does). */
  async function changePhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 1 })
    if (res.canceled || !res.assets[0]) return
    setBusy(true)
    setNote(null)
    try {
      const img = await ImageManipulator.manipulate(res.assets[0].uri).resize({ width: 512 }).renderAsync()
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true })
      const bytes = Uint8Array.from(atob(out.base64 ?? ''), (c) => c.charCodeAt(0))
      const path = `${me.id}/avatar`
      const { error: e } = await supabase.storage.from('avatars').upload(path, bytes, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
      if (e) throw e
      const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`
      setProfile(await storage.profile.update(me.id, { avatar_url: url }))
      setNote({ text: 'Photo updated.' })
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    // This phone stops getting this person's notifications (while still signed in, so the database allows it).
    await disablePush().catch(() => {})
    clearProfile()
    clearPlan()
    await supabase.auth.signOut({ scope: 'local' })
  }

  return (
    <TrackerScreen edges={['top']}>
      {/* You: photo, name, email and plan, on the brand gradient. */}
      <View style={styles.hero} onLayout={(e) => setHero({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        <Svg width={hero.w} height={hero.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="profileHero" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#1A6DB5" />
              <Stop offset="0.55" stopColor="#4A5BC4" />
              <Stop offset="1" stopColor="#7C6BD6" />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={hero.w} height={hero.h} fill="url(#profileHero)" />
        </Svg>
        <Pressable onPress={() => void changePhoto()} disabled={busy} style={styles.avatarWrap} accessibilityRole="button" accessibilityLabel="Change photo">
          {me.avatar_url ? (
            <Image source={{ uri: me.avatar_url }} style={styles.avatar} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
          )}
          <View style={styles.camera}>{busy ? <ActivityIndicator size="small" color={COLORS.ink} /> : <Camera size={15} color={COLORS.ink} />}</View>
        </Pressable>
        <Text style={styles.name} accessibilityRole="header">
          {me.full_name || 'Your name'}
        </Text>
        <Text style={styles.email}>{session?.user.email}</Text>
        {!!planLine && (
          <Pressable onPress={() => router.push('/plans')} disabled={!CAN_UPGRADE_IN_APP} style={[styles.planPill, plan?.premium && styles.planPremium]} accessibilityRole="button" accessibilityLabel={`${planLine}. Open Premium`}>
            {plan?.premium && <Crown size={13} color="#8A4B0A" />}
            <Text style={[styles.plan, plan?.premium && { color: '#8A4B0A' }]}>{planLine}</Text>
          </Pressable>
        )}
        <View style={styles.stats}>
          {stats.map((st, i) => (
            <View key={st.label} style={[styles.stat, i > 0 && styles.statDivider]}>
              <Text style={styles.statValue}>
                {st.value}
                {!!st.unit && <Text style={styles.statUnit}> {st.unit}</Text>}
              </Text>
              <Text style={styles.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>
      </View>
      <Status note={note} />

      <Text style={styles.section} accessibilityRole="header">
        Your goals
      </Text>
      <View style={styles.goals}>
        {targets.map((g) => {
          const t = TRACKERS[g.id]
          const Icon = t.icon
          return (
            <View key={g.id} style={[styles.goal, { backgroundColor: t.tint }]}>
              <View style={styles.goalIcon}>
                <Icon size={18} color={t.accent} />
              </View>
              <Text style={[styles.goalName, { color: t.accent }]}>{t.name}</Text>
              <Text style={styles.goalValue}>{g.value}</Text>
              <Text style={styles.goalPer}>{g.per}</Text>
            </View>
          )
        })}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        About you
      </Text>
      <View style={styles.group}>
        {details.map((d, i) => {
          const Icon = d.icon
          return (
            <View key={d.label} style={[styles.detail, i > 0 && styles.rowDivider]}>
              <Icon size={18} color={COLORS.muted} />
              <Text style={styles.detailLabel}>{d.label}</Text>
              <Text style={styles.detailValue}>{d.value}</Text>
            </View>
          )
        })}
      </View>

      <Text style={styles.section} accessibilityRole="header">
        Account
      </Text>
      <View style={styles.group}>
        <MenuRow icon={Pencil} color="#1A6DB5" label="Edit profile" hint="Photo, details and goals" onPress={() => router.push('/edit-profile')} />
        {CAN_UPGRADE_IN_APP && <MenuRow icon={Crown} color="#B9650E" label="Premium" hint={plan?.premium ? 'Your plan and renewal' : 'See what Premium adds'} onPress={() => router.push('/plans')} divider />}
        <MenuRow icon={BellRing} color="#E9851F" label="Reminders & notifications" hint="Times, repeats and this phone" onPress={() => router.push('/reminders')} divider />
        <MenuRow icon={KeyRound} color="#4A5BC4" label="Change password" onPress={() => router.push('/change-password')} divider />
        <MenuRow icon={LogOut} color={COLORS.muted} label="Log out" onPress={() => void signOut()} divider />
      </View>

      <Pressable onPress={() => router.push('/delete-account')} style={styles.delete} accessibilityRole="button">
        <Text style={styles.deleteText}>Delete my account</Text>
      </Pressable>
      {!!version && <Text style={styles.version}>OmniWell {version}</Text>}
    </TrackerScreen>
  )
}

function MenuRow({ icon: Icon, color, label, hint, onPress, divider }: { icon: LucideIcon; color: string; label: string; hint?: string; onPress: () => void; divider?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, divider && styles.rowDivider, pressed && { backgroundColor: COLORS.mist }]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={[styles.menuIcon, { backgroundColor: `${color}1A` }]}>
        <Icon size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuLabel}>{label}</Text>
        {!!hint && <Text style={styles.menuHint}>{hint}</Text>}
      </View>
      <ChevronRight size={18} color={COLORS.muted} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  hero: { borderRadius: 28, overflow: 'hidden', alignItems: 'center', paddingTop: 26, paddingHorizontal: 18, paddingBottom: 18, backgroundColor: '#3E64C0' },
  avatarWrap: { width: 96, height: 96 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)' },
  avatarEmpty: { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 32, fontWeight: '800', color: COLORS.white },
  camera: { position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  name: { marginTop: 12, fontSize: 24, fontWeight: '800', color: COLORS.white, letterSpacing: -0.4, textAlign: 'center' },
  email: { marginTop: 2, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  planPill: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: RADIUS.pill, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5 },
  planPremium: { backgroundColor: '#FFE7B8' },
  plan: { fontSize: 13, fontWeight: '800', color: COLORS.white },
  stats: { marginTop: 18, alignSelf: 'stretch', flexDirection: 'row', borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.35)' },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.white },
  statUnit: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  statLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  section: { marginTop: 6, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  goals: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  goal: { width: '48.5%', borderRadius: 22, padding: 14, gap: 2 },
  goalIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  goalName: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  goalValue: { fontSize: 20, fontWeight: '800', color: COLORS.ink },
  goalPer: { fontSize: 12, color: COLORS.muted },
  group: { borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden' },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  detail: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 52 },
  detailLabel: { flex: 1, fontSize: 15, color: COLORS.muted },
  detailValue: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 60 },
  menuIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  menuHint: { marginTop: 1, fontSize: 13, color: COLORS.muted },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '700', color: COLORS.alert },
  version: { textAlign: 'center', fontSize: 12, color: COLORS.muted, marginTop: -8 },
})
