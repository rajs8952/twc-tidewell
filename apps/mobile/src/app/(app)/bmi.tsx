import { HEIGHT_CM, bmi, bmiBand, healthyWeightRange } from '@rajs8952/core/biometrics'
import { MAX_KG, MIN_KG, round1 } from '@rajs8952/core/weight'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Card, Label, Muted, SectionTitle, Status, TrackerScreen } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { messageOf, storage } from '@/lib/trackers'

/** The WHO adult bands on a 15–35 scale, for the bar. */
const BANDS = [
  { to: 18.5, color: '#7FCBF0' },
  { to: 25, color: '#4F9B5B' },
  { to: 30, color: '#F2AE2E' },
  { to: 35, color: '#E9851F' },
]

/** BMI from the profile's height and weight, editable (and saved back to the profile). */
export default function BmiScreen() {
  const { profile, setProfile, error } = useProfile()
  // What's typed; until then, the profile's values.
  const [heightDraft, setHeight] = useState<string | null>(null)
  const [weightDraft, setWeight] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const height = heightDraft ?? (profile?.height_cm ? String(profile.height_cm) : '')
  const weight = weightDraft ?? (profile?.weight_kg ? String(round1(profile.weight_kg)) : '')

  const h = Number(height.replace(',', '.'))
  const w = Number(weight.replace(',', '.'))
  const okH = Number.isFinite(h) && h >= HEIGHT_CM.min && h <= HEIGHT_CM.max
  const okW = Number.isFinite(w) && w >= MIN_KG && w <= MAX_KG
  const value = okH && okW ? bmi(h, w) : null
  const band = value ? bmiBand(value) : null
  const healthy = okH ? healthyWeightRange(h) : null
  const changed = !!profile && okH && okW && (h !== profile.height_cm || round1(w) !== round1(profile.weight_kg))

  async function save() {
    if (!profile) return
    setBusy(true)
    setNote(null)
    try {
      setProfile(await storage.profile.update(profile.id, { height_cm: round1(h), weight_kg: round1(w) }))
      setNote({ text: 'Saved to your profile.' })
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TrackerScreen title={'BMI calculator'}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card style={styles.hero}>
        <Label>Your BMI</Label>
        <Text style={[styles.value, { color: value ? COLORS.ink : COLORS.muted }]}>{value ?? '—'}</Text>
        <Text style={styles.band}>{band?.label ?? 'Enter your height and weight'}</Text>
        <View style={styles.scale} accessible={false}>
          {BANDS.map((b, i) => (
            <View key={b.to} style={[styles.segment, { backgroundColor: b.color, flex: b.to - (BANDS[i - 1]?.to ?? 15) }]} />
          ))}
          {band && <View style={[styles.marker, { left: `${band.position * 100}%` }]} />}
        </View>
        {healthy && <Muted style={{ textAlign: 'center' }}>At {h} cm, the healthy range is {healthy.min}–{healthy.max} kg.</Muted>}
      </Card>

      <Card>
        <SectionTitle>Your measurements</SectionTitle>
        <Field label="Height (cm)" value={height} onChangeText={(t) => setHeight(t.replace(/[^0-9.,]/g, '').slice(0, 5))} keyboardType="decimal-pad" placeholder="e.g. 170" />
        {!!height && !okH && <Text style={styles.problem}>Height must be between {HEIGHT_CM.min} and {HEIGHT_CM.max} cm.</Text>}
        <Field label="Weight (kg)" value={weight} onChangeText={(t) => setWeight(t.replace(/[^0-9.,]/g, '').slice(0, 6))} keyboardType="decimal-pad" placeholder="e.g. 70" />
        {!!weight && !okW && <Text style={styles.problem}>Weight must be between {MIN_KG} and {MAX_KG} kg.</Text>}
        <Button title="Save to my profile" onPress={() => void save()} busy={busy} disabled={!changed} />
        <Status note={note} />
      </Card>

      <Muted style={{ fontSize: 13 }}>
        BMI is only a rough guide: it doesn’t account for muscle, frame or age. If you’re unsure what yours means for you, a chat with the dietitian can help.
      </Muted>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24 },
  value: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'] },
  band: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  scale: { alignSelf: 'stretch', flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'visible', marginTop: 8, gap: 2 },
  segment: { height: 10, borderRadius: 5 },
  marker: { position: 'absolute', top: -5, width: 4, height: 20, marginLeft: -2, borderRadius: 2, backgroundColor: COLORS.ink },
  problem: { fontSize: 13, fontWeight: '600', color: COLORS.alert },
})
