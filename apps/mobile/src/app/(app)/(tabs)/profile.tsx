import { ageFromBirthYear, bmi } from '@rajs8952/core/biometrics'
import { goalsOf } from '@rajs8952/core/goals'
import { ACTIVITY_LEVELS, GENDERS, effectiveGoal, formatMl } from '@rajs8952/core/hydration'
import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { BellRing, Camera, Crown, KeyRound, Pencil } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Card, Muted, SectionTitle, Status, TrackerScreen } from '@/components/kit'
import { Button, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { useSession } from '@/lib/auth'
import { clearPlan, daysLeft, usePlan } from '@/lib/plan'
import { clearProfile, useProfile } from '@/lib/profile'
import { disablePush } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { COLORS } from '@/lib/theme'
import { messageOf, storage } from '@/lib/trackers'

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

  const details = [
    { label: 'Height', value: me.height_cm ? `${me.height_cm} cm` : 'Not set' },
    { label: 'Weight', value: `${me.weight_kg} kg` },
    { label: 'Age', value: age != null ? String(age) : 'Not set' },
    { label: 'Sex', value: GENDERS.find((g) => g.id === me.gender)?.label ?? '—' },
    { label: 'Activity', value: ACTIVITY_LEVELS.find((a) => a.id === me.activity_level)?.label ?? '—' },
    ...(value ? [{ label: 'BMI', value: String(value) }] : []),
  ]
  const targets = [
    { label: 'Water', value: `${formatMl(effectiveGoal(me))} a day${me.custom_goal_ml != null ? ' (your own)' : ''}` },
    { label: 'Sleep', value: `${fmtMin(goals.sleepMin)} a night` },
    { label: 'Meditation', value: `${goals.meditationMin} min a day` },
    { label: 'Exercise', value: `${goals.exerciseWeekMin} min a week` },
  ]

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
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>

      <Card>
        <View style={styles.account}>
          <Pressable onPress={() => void changePhoto()} disabled={busy} style={styles.avatarWrap} accessibilityRole="button" accessibilityLabel="Change photo">
            {me.avatar_url ? (
              <Image source={{ uri: me.avatar_url }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarEmpty]}>
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
            <View style={styles.camera}>{busy ? <ActivityIndicator size="small" color={COLORS.white} /> : <Camera size={14} color={COLORS.white} />}</View>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{me.full_name || 'Your name'}</Text>
            <Muted>{session?.user.email}</Muted>
            {!!planLine && (
              <View style={styles.planRow}>
                {plan?.premium && <Crown size={14} color="#B9650E" />}
                <Text style={[styles.plan, plan?.premium && { color: '#8A4B0A' }]}>{planLine}</Text>
              </View>
            )}
          </View>
        </View>
        <Status note={note} />
      </Card>

      <Card>
        <SectionTitle>Your details</SectionTitle>
        <Rows rows={details} />
      </Card>

      <Card>
        <SectionTitle>Your goals</SectionTitle>
        <Rows rows={targets} />
      </Card>

      <Pressable onPress={() => router.push('/edit-profile')} style={({ pressed }) => [styles.edit, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <Pencil size={18} color={COLORS.white} />
        <Text style={styles.editText}>Edit profile</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/reminders')} style={({ pressed }) => [styles.reminders, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <BellRing size={18} color={COLORS.ink} />
        <Text style={styles.remindersText}>Reminders & notifications</Text>
      </Pressable>

      <Pressable onPress={() => router.push('/change-password')} style={({ pressed }) => [styles.reminders, pressed && { opacity: 0.85 }]} accessibilityRole="button">
        <KeyRound size={18} color={COLORS.ink} />
        <Text style={styles.remindersText}>Change password</Text>
      </Pressable>

      <Button title="Log out" variant="secondary" onPress={() => void signOut()} />

      <Pressable onPress={() => router.push('/delete-account')} style={styles.delete} accessibilityRole="button">
        <Text style={styles.deleteText}>Delete my account</Text>
      </Pressable>
    </TrackerScreen>
  )
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={styles.rowLabel}>{r.label}</Text>
          <Text style={styles.rowValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, borderRadius: 36 },
  avatarEmpty: { backgroundColor: COLORS.mist, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 24, fontWeight: '800', color: COLORS.ink },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.ink, borderWidth: 2, borderColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 19, fontWeight: '800', color: COLORS.ink },
  planRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 4 },
  plan: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line },
  rowLabel: { fontSize: 15, color: COLORS.muted },
  rowValue: { flexShrink: 1, textAlign: 'right', fontSize: 15, fontWeight: '700', color: COLORS.ink },
  edit: { minHeight: 52, borderRadius: 999, backgroundColor: COLORS.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  editText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  reminders: { minHeight: 52, borderRadius: 999, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  delete: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteText: { fontSize: 14, fontWeight: '700', color: COLORS.alert },
  remindersText: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
})
