import DateTimePicker from '@react-native-community/datetimepicker'
import { dayKey } from '@rajs8952/core/dates'
import { goalsOf } from '@rajs8952/core/goals'
import { HOURS_STEP, MAX_AWAKENINGS, MAX_HOURS, MIN_HOURS, QUALITY_LABELS, bedDate, formatDuration, formatTime, sleepRange, wakeDate, type SleepLog } from '@rajs8952/core/sleep'
import { hhmm } from '@rajs8952/core/when'
import { useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native'
import { Bar, Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, SectionTitle, Status, Stepper, TrackerScreen } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile } from '@/lib/profile'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS, storage, unwrap } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

const ACCENT = TRACKERS.sleep.accent

async function load() {
  const [profile, logs] = await Promise.all([loadProfile(), storage.sleep.list(sleepRange()).then(unwrap)])
  return { goal: goalsOf(profile).sleepMin, logs }
}

const fmtHours = (h: number) => formatDuration(Math.round(h * 60))

/** Sleep: last night against the goal, logging a night (wake time + hours slept), and the last two weeks. */
export default function Sleep() {
  const { data, error, refreshing, refresh, reload } = useLoad(load)
  /** Days before today the night ended (0 today, -1 yesterday; editing can go further back). */
  const [wakeDay, setWakeDay] = useState(0)
  const [wakeAt, setWakeAt] = useState('07:00')
  const [hours, setHours] = useState(7.5)
  const [quality, setQuality] = useState<number | null>(null)
  const [awakenings, setAwakenings] = useState<number | null>(null)
  const [text, setText] = useState('')
  const [androidPicker, setAndroidPicker] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  /** The night being edited, if any. */
  const [editing, setEditing] = useState<SleepLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  const wake = wakeDate(wakeAt, wakeDay as 0 | -1)
  const bed = bedDate(wake, hours)
  const lastNight = data?.logs.filter((l) => dayKey(new Date(l.wake_at)) === dayKey(new Date())).reduce((s, l) => s + l.duration_min, 0) ?? 0
  const asDate = () => {
    const [h, m] = wakeAt.split(':').map(Number)
    const d = new Date()
    d.setHours(h ?? 7, m ?? 0, 0, 0)
    return d
  }

  function edit(l: SleepLog) {
    const w = new Date(l.wake_at)
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    setEditing(l)
    setWakeDay(Math.round((day(w) - day(new Date())) / 86_400_000))
    setWakeAt(hhmm(w))
    setHours(Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round((l.duration_min / 60) * 4) / 4)))
    setQuality(l.quality)
    setAwakenings(l.awakenings)
    setText(l.note ?? '')
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  function reset() {
    setEditing(null)
    setWakeDay(0)
    setQuality(null)
    setAwakenings(null)
    setText('')
  }

  async function save() {
    if (!quality) return setNote({ text: 'Rate how well you slept.', error: true })
    setBusy(true)
    setNote(null)
    const input = { bed_at: bed.toISOString(), wake_at: wake.toISOString(), quality, awakenings, note: text }
    const r = editing ? await storage.sleep.update(editing.id, input) : await storage.sleep.create(input)
    setBusy(false)
    if (!r.ok) return setNote({ text: r.error, error: true })
    setNote({ text: editing ? 'Night updated.' : `Saved ${formatDuration(r.data.duration_min)} of sleep.` })
    reset()
    await reload()
  }

  async function remove(id: string) {
    const r = await storage.sleep.remove(id)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing?.id === id) reset()
    await reload()
  }

  return (
    <TrackerScreen refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <Label>Last night</Label>
        <Text style={styles.big}>{lastNight ? formatDuration(lastNight) : 'Not logged yet'}</Text>
        {data && <Muted>Your goal: {formatDuration(data.goal)} a night</Muted>}
        {data && <Bar progress={lastNight / data.goal} color={ACCENT} />}
      </Card>

      <Card>
        <SectionTitle>{editing ? 'Edit night' : 'Log a night'}</SectionTitle>
        {editing && <EditingBar onCancel={reset} color={ACCENT} />}
        <Label>I woke up</Label>
        <ChipRow>
          <Chip label="Today" selected={wakeDay === 0} onPress={() => setWakeDay(0)} color={ACCENT} />
          <Chip label="Yesterday" selected={wakeDay === -1} onPress={() => setWakeDay(-1)} color={ACCENT} />
          {wakeDay < -1 && <Chip label={wake.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} selected onPress={() => {}} color={ACCENT} />}
        </ChipRow>
        {Platform.OS === 'ios' ? (
          <View style={styles.timeRow}>
            <Muted>at</Muted>
            <DateTimePicker mode="time" display="compact" value={asDate()} onChange={(_e, d) => d && setWakeAt(hhmm(d))} />
          </View>
        ) : (
          <>
            <Pressable onPress={() => setAndroidPicker(true)} style={styles.timeButton} accessibilityRole="button">
              <Text style={styles.timeText}>at {formatTime(wake)}</Text>
            </Pressable>
            {androidPicker && (
              <DateTimePicker
                mode="time"
                value={asDate()}
                onChange={(e, d) => {
                  setAndroidPicker(false)
                  if (e.type === 'set' && d) setWakeAt(hhmm(d))
                }}
              />
            )}
          </>
        )}
        <Label>Hours slept</Label>
        <Stepper label="Hours slept" value={hours} onChange={setHours} step={HOURS_STEP} min={MIN_HOURS} max={MAX_HOURS} format={fmtHours} />
        <Muted>
          Bedtime about {formatTime(bed)} · wake {formatTime(wake)}
        </Muted>
        <Label>How well did you sleep?</Label>
        <ChipRow>
          {QUALITY_LABELS.map((l, i) => (
            <Chip key={l} label={l} selected={quality === i + 1} onPress={() => setQuality(i + 1)} color={ACCENT} />
          ))}
        </ChipRow>
        <Label>Woke up during the night (optional)</Label>
        {awakenings === null ? (
          <Chip label="Add wake-ups" selected={false} onPress={() => setAwakenings(1)} />
        ) : (
          <Stepper label="Wake-ups" value={awakenings} onChange={setAwakenings} step={1} min={0} max={MAX_AWAKENINGS} format={(v) => `${v} ${v === 1 ? 'time' : 'times'}`} />
        )}
        <Field label="Note (optional)" value={text} onChangeText={setText} multiline maxLength={1000} placeholder="Late coffee, noisy night…" style={{ minHeight: 64, textAlignVertical: 'top' }} />
        <Button title={editing ? 'Save changes' : 'Save night'} onPress={() => void save()} busy={busy} disabled={!quality} />
        <Status note={note} />
      </Card>

      <Card>
        <SectionTitle>Last two weeks</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.logs.length && <Muted>No nights logged yet.</Muted>}
        {data?.logs.map((l) => (
          <EntryRow
            key={l.id}
            accent={ACCENT}
            title={`${formatDuration(l.duration_min)} · ${QUALITY_LABELS[l.quality - 1]}`}
            detail={[`${formatTime(l.bed_at)} – ${formatTime(l.wake_at)}`, l.awakenings != null && `woke ${l.awakenings}×`, l.note].filter(Boolean).join(' · ')}
            when={`Woke ${new Date(l.wake_at).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}`}
            onDelete={() => void remove(l.id)}
            onEdit={() => edit(l)}
            editing={editing?.id === l.id}
          />
        ))}
      </Card>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  big: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.field, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
})
