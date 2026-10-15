import { MAX_FAT, MAX_KG, MIN_FAT, MIN_KG, formatChange, formatWeight, fromUnit, round1, toUnit, weightRange, type WeightLog, type WeightUnit } from '@rajs8952/core/weight'
import { whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
import * as SecureStore from 'expo-secure-store'
import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Switch, Text, View, useWindowDimensions, type ScrollView } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import { Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, SectionTitle, Status, TrackerScreen, WhenPicker, whenLabel } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile, setProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { TRACKERS, storage, unwrap } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

const ACCENT = TRACKERS.weight.accent
const UNIT_KEY = 'omniwell.weight-unit'

/** Weight: the latest weigh-in and the 90-day trend, logging a weigh-in, and past entries. */
export default function Weight() {
  const { data, error, savedAt, refreshing, refresh, reload } = useLoad(async () => unwrap(await storage.weight.list(weightRange())), 'weight')
  const [unit, setUnit] = useState<WeightUnit>('kg')
  const [value, setValue] = useState('')
  const [fat, setFat] = useState('')
  const [sync, setSync] = useState(false)
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  // The unit is a display preference on this phone (always stored in kg).
  useEffect(() => {
    SecureStore.getItemAsync(UNIT_KEY).then((u) => u === 'lb' && setUnit('lb'), () => {})
  }, [])
  function chooseUnit(u: WeightUnit) {
    setUnit(u)
    if (value) setValue(String(round1(toUnit(fromUnit(Number(value), unit), u))))
    SecureStore.setItemAsync(UNIT_KEY, u).catch(() => {})
  }

  /** The weigh-in being edited, if any (editing never changes the profile weight). */
  const [editing, setEditing] = useState<WeightLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  function edit(l: WeightLog) {
    setEditing(l)
    setValue(String(round1(toUnit(l.weight_kg, unit))))
    setFat(l.body_fat_pct != null ? String(l.body_fat_pct) : '')
    setWhen({ day: 'original', iso: l.logged_at })
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  function reset() {
    setEditing(null)
    setValue('')
    setFat('')
    setWhen({ day: 'now' })
  }

  const [now] = useState(() => Date.now())
  const latest = data?.[0]
  const monthAgo = data?.find((l) => Date.parse(l.logged_at) <= now - 28 * 86_400_000)

  async function save() {
    const n = Number(value.replace(',', '.'))
    if (!value || !Number.isFinite(n)) return setNote({ text: `Enter your weight in ${unit}.`, error: true })
    const kg = round1(fromUnit(n, unit))
    if (kg < MIN_KG || kg > MAX_KG) return setNote({ text: `Weight must be between ${formatWeight(MIN_KG, unit)} and ${formatWeight(MAX_KG, unit)}.`, error: true })
    const f = fat ? Number(fat.replace(',', '.')) : null
    if (f !== null && (!Number.isFinite(f) || f < MIN_FAT || f > MAX_FAT)) return setNote({ text: `Body fat must be between ${MIN_FAT}% and ${MAX_FAT}%.`, error: true })
    const problem = whenProblem(when)
    if (problem) return setNote({ text: problem, error: true })
    setBusy(true)
    setNote(null)
    const input = { weight_kg: kg, body_fat_pct: f, note: editing?.note ?? null, sync_profile: editing ? false : sync, logged_at: whenToIso(when) }
    const r = editing ? await storage.weight.update(editing.id, input) : await storage.weight.create(input)
    setBusy(false)
    if (!r.ok) return setNote({ text: r.error, error: true })
    setNote({ text: editing ? 'Weigh-in updated.' : `Saved ${formatWeight(kg, unit)}.${sync ? (r.data.profileSynced ? ' Your water goal now uses it.' : ' Your profile weight couldn’t be updated.') : ''}` })
    if (r.data.profileSynced) loadProfile(true).then(setProfile, () => {})
    reset()
    await reload()
  }

  async function remove(id: string) {
    const r = await storage.weight.remove(id)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing?.id === id) reset()
    await reload()
  }

  return (
    <TrackerScreen title={TRACKERS.weight.name} savedAt={savedAt} refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <View style={styles.headRow}>
          <View style={{ flex: 1, gap: 4 }}>
            <Label>Latest</Label>
            <Text style={styles.big}>{latest ? formatWeight(latest.weight_kg, unit) : 'No weigh-ins yet'}</Text>
            {latest && <Muted>{whenLabel(latest.logged_at)}{monthAgo ? ` · ${formatChange(latest.weight_kg - monthAgo.weight_kg, unit)} in 4 weeks` : ''}</Muted>}
          </View>
          <ChipRow>
            <Chip label="kg" selected={unit === 'kg'} onPress={() => chooseUnit('kg')} color={ACCENT} />
            <Chip label="lb" selected={unit === 'lb'} onPress={() => chooseUnit('lb')} color={ACCENT} />
          </ChipRow>
        </View>
        {data && data.length >= 2 && <Trend logs={data} unit={unit} />}
        <Muted style={{ fontSize: 13 }}>Weight moves around day to day. Weekly weigh-ins at the same time of day show the real trend.</Muted>
      </Card>

      <Card>
        <SectionTitle>{editing ? 'Edit weigh-in' : 'Log a weigh-in'}</SectionTitle>
        {editing && <EditingBar onCancel={reset} color={ACCENT} />}
        <Field label={`Weight (${unit})`} value={value} onChangeText={(t) => setValue(t.replace(/[^0-9.,]/g, '').slice(0, 6))} keyboardType="decimal-pad" placeholder={unit === 'kg' ? 'e.g. 72.4' : 'e.g. 159.6'} />
        <Field label="Body fat % (optional)" value={fat} onChangeText={(t) => setFat(t.replace(/[^0-9.,]/g, '').slice(0, 4))} keyboardType="decimal-pad" placeholder="e.g. 22" />
        {!editing && <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Label>Update my profile weight</Label>
            <Muted style={{ fontSize: 13 }}>Your water goal is worked out from it.</Muted>
          </View>
          <Switch value={sync} onValueChange={setSync} trackColor={{ true: ACCENT, false: COLORS.line }} accessibilityLabel="Update my profile weight" />
        </View>}
        <Label>When</Label>
        <WhenPicker value={when} onChange={setWhen} color={ACCENT} original={editing?.logged_at} />
        <Button title={editing ? 'Save changes' : 'Save weigh-in'} onPress={() => void save()} busy={busy} />
        <Status note={note} />
      </Card>

      <Card>
        <SectionTitle>Last 90 days</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.length && <Muted>No weigh-ins yet. Weekly is plenty.</Muted>}
        {data?.map((l) => (
          <EntryRow key={l.id} accent={ACCENT} title={formatWeight(l.weight_kg, unit)} detail={[l.body_fat_pct != null && `${l.body_fat_pct}% body fat`, l.note].filter(Boolean).join(' · ')} when={whenLabel(l.logged_at)} onDelete={() => void remove(l.id)} onEdit={() => edit(l)} editing={editing?.id === l.id} />
        ))}
      </Card>
    </TrackerScreen>
  )
}

/** The weigh-ins over 90 days as one line (oldest left), with the range labelled. */
function Trend({ logs, unit }: { logs: WeightLog[]; unit: WeightUnit }) {
  const { width } = useWindowDimensions()
  const w = width - 32 - 34 // screen padding and card padding
  const h = 120
  const pad = { top: 10, bottom: 18, left: 4, right: 44 }
  const pts = [...logs].reverse().map((l) => ({ t: Date.parse(l.logged_at), v: toUnit(l.weight_kg, unit) }))
  const [end] = useState(() => Date.now())
  const start = end - 90 * 86_400_000
  let lo = Math.min(...pts.map((p) => p.v))
  let hi = Math.max(...pts.map((p) => p.v))
  if (hi - lo < 2) {
    lo -= 1
    hi += 1
  }
  const x = (t: number) => pad.left + ((t - start) / (end - start)) * (w - pad.left - pad.right)
  const y = (v: number) => pad.top + (1 - (v - lo) / (hi - lo)) * (h - pad.top - pad.bottom)
  const last = pts[pts.length - 1]!
  return (
    <View accessible accessibilityLabel={`Weight trend over 90 days, from ${round1(pts[0]!.v)} to ${round1(last.v)} ${unit}`}>
      <Svg width={w} height={h}>
        <Line x1={pad.left} x2={w - pad.right} y1={y(hi)} y2={y(hi)} stroke={COLORS.line} strokeWidth={1} />
        <Line x1={pad.left} x2={w - pad.right} y1={y(lo)} y2={y(lo)} stroke={COLORS.line} strokeWidth={1} />
        <SvgText x={w - pad.right + 6} y={y(hi) + 4} fontSize={11} fill={COLORS.muted}>{`${round1(hi)}`}</SvgText>
        <SvgText x={w - pad.right + 6} y={y(lo) + 4} fontSize={11} fill={COLORS.muted}>{`${round1(lo)}`}</SvgText>
        <SvgText x={pad.left} y={h - 4} fontSize={11} fill={COLORS.muted}>90 days ago</SvgText>
        <SvgText x={w - pad.right} y={h - 4} fontSize={11} fill={COLORS.muted} textAnchor="end">Today</SvgText>
        <Polyline points={pts.map((p) => `${x(p.t)},${y(p.v)}`).join(' ')} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={x(last.t)} cy={y(last.v)} r={5} fill={ACCENT} stroke={COLORS.white} strokeWidth={2} />
      </Svg>
    </View>
  )
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  big: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
