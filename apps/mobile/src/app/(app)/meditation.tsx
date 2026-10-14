import { goalsOf } from '@rajs8952/core/goals'
import { CALM_LABELS, DURATIONS, MAX_MINUTES, SESSION_BY_ID, SESSION_TYPES, formatClock, formatMinutes, meditationRange, type MeditationLog, type SessionType } from '@rajs8952/core/meditation'
import { dayKey } from '@rajs8952/core/dates'
import { whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
import { useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View, type ScrollView } from 'react-native'
import { Bar, Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, Ring, SectionTitle, Status, Stepper, TrackerScreen, WhenPicker, whenLabel } from '@/components/kit'
import { Button, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { TRACKERS, storage, unwrap } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

const ACCENT = TRACKERS.meditation.accent

async function load() {
  const [profile, logs] = await Promise.all([loadProfile(), storage.meditation.list(meditationRange()).then(unwrap)])
  return { goal: goalsOf(profile).meditationMin, logs }
}

/** Meditation: a timer or a quick log, today's minutes toward the goal, and this week's sessions. */
export default function Meditation() {
  const { data, error, refreshing, refresh, reload } = useLoad(load)
  const [type, setType] = useState<SessionType>('mindfulness')
  const [minutes, setMinutes] = useState(10)
  const [calmBefore, setCalmBefore] = useState<number | null>(null)
  const [calmAfter, setCalmAfter] = useState<number | null>(null)
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  /** The running timer: when it started and how long it's set for. */
  const [timer, setTimer] = useState<{ startedAt: number; seconds: number } | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const today = dayKey(new Date())
  const todayMin = data?.logs.filter((l) => dayKey(new Date(l.logged_at)) === today).reduce((s, l) => s + l.duration_min, 0) ?? 0

  // Tick once a second while the timer runs; the time is worked out from the clock, so it stays right in the background.
  useEffect(() => {
    if (!timer) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    const sub = AppState.addEventListener('change', () => setNow(Date.now()))
    return () => {
      clearInterval(t)
      sub.remove()
    }
  }, [timer])
  const elapsed = timer ? Math.min((now - timer.startedAt) / 1000, timer.seconds) : 0
  const finished = !!timer && elapsed >= timer.seconds
  const doneOnce = useRef(false)
  useEffect(() => {
    if (finished && !doneOnce.current) {
      doneOnce.current = true
      setNote({ text: 'Time’s up. Save your session below.' })
    }
  }, [finished])

  /** The session being edited, if any (the form then changes it; the timer is hidden). */
  const [editing, setEditing] = useState<MeditationLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  function edit(l: MeditationLog) {
    setEditing(l)
    setTimer(null)
    setType(l.session_type)
    setMinutes(l.duration_min)
    setCalmBefore(l.calm_before)
    setCalmAfter(l.calm_after)
    setWhen({ day: 'original', iso: l.logged_at })
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  function stopEditing() {
    setEditing(null)
    setCalmBefore(null)
    setCalmAfter(null)
    setWhen({ day: 'now' })
  }

  async function save(durationMin: number, at?: string) {
    const problem = whenProblem(when)
    if (!at && problem) return setNote({ text: problem, error: true })
    setBusy(true)
    setNote(null)
    const input = { duration_min: durationMin, session_type: type, calm_before: calmBefore, calm_after: calmAfter, note: editing?.note ?? null, logged_at: at ?? whenToIso(when) }
    const r = editing ? await storage.meditation.update(editing.id, input) : await storage.meditation.create(input)
    setBusy(false)
    if (!r.ok) return setNote({ text: r.error, error: true })
    setNote({ text: editing ? 'Session updated.' : `Saved ${formatMinutes(durationMin)} of ${SESSION_BY_ID[type].label.toLowerCase()}.` })
    setEditing(null)
    setTimer(null)
    setCalmBefore(null)
    setCalmAfter(null)
    setWhen({ day: 'now' })
    await reload()
  }

  function start() {
    doneOnce.current = false
    setNote(null)
    setNow(Date.now())
    setTimer({ startedAt: Date.now(), seconds: minutes * 60 })
  }

  async function remove(id: string) {
    const r = await storage.meditation.remove(id)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing?.id === id) stopEditing()
    await reload()
  }

  const timedMinutes = Math.max(1, Math.round(elapsed / 60))

  return (
    <TrackerScreen refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <View style={styles.todayRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Label>Today</Label>
            <Text style={styles.big}>{formatMinutes(todayMin)}</Text>
            {data && <Muted>of your {formatMinutes(data.goal)} goal</Muted>}
          </View>
        </View>
        {data && <Bar progress={todayMin / data.goal} color={ACCENT} />}
      </Card>

      {timer ? (
        <Card style={styles.timerCard}>
          <View style={{ alignItems: 'center' }}>
          <Ring progress={elapsed / timer.seconds} color={ACCENT} size={200} stroke={12}>
            <Text style={styles.clock} accessibilityLabel={`${formatClock(timer.seconds - elapsed)} left`}>
              {formatClock(timer.seconds - elapsed)}
            </Text>
            <Muted>{SESSION_BY_ID[type].label}</Muted>
          </Ring>
          </View>
          <Muted style={{ textAlign: 'center' }}>{SESSION_BY_ID[type].hint}</Muted>
          {finished || elapsed >= 60 ? (
            <>
              <Calm label="How calm do you feel now?" value={calmAfter} onChange={setCalmAfter} />
              <Button title={`Save ${formatMinutes(finished ? timer.seconds / 60 : timedMinutes)}`} onPress={() => void save(finished ? timer.seconds / 60 : timedMinutes, new Date(timer.startedAt).toISOString())} busy={busy} />
            </>
          ) : null}
          <Button title={finished ? 'Discard' : 'Stop without saving'} variant="secondary" onPress={() => setTimer(null)} />
          <Status note={note} />
        </Card>
      ) : (
        <Card>
          <SectionTitle>{editing ? 'Edit session' : 'Meditate'}</SectionTitle>
          {editing && <EditingBar onCancel={stopEditing} color={ACCENT} />}
          <Label>Type</Label>
          <ChipRow>
            {SESSION_TYPES.map((s) => (
              <Chip key={s.id} label={s.label} selected={type === s.id} onPress={() => setType(s.id)} color={ACCENT} />
            ))}
          </ChipRow>
          <Muted>{SESSION_BY_ID[type].hint}</Muted>
          <Label>Length</Label>
          <ChipRow>
            {DURATIONS.map((d) => (
              <Chip key={d} label={`${d} min`} selected={minutes === d} onPress={() => setMinutes(d)} color={ACCENT} />
            ))}
          </ChipRow>
          <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={1} min={1} max={MAX_MINUTES} format={(v) => formatMinutes(v)} />
          <Calm label={editing ? 'How calm did you feel before? (optional)' : 'How calm do you feel before? (optional)'} value={calmBefore} onChange={setCalmBefore} />
          {!editing && (
            <>
              <Button title={`Start a ${minutes}-minute timer`} onPress={start} />
              <View style={styles.divider} />
              <Label>Already meditated? Log it</Label>
            </>
          )}
          {editing && <Label>When</Label>}
          <WhenPicker value={when} onChange={setWhen} color={ACCENT} original={editing?.logged_at} />
          <Calm label="How calm did you feel after? (optional)" value={calmAfter} onChange={setCalmAfter} />
          <Button title={editing ? 'Save changes' : `Log ${formatMinutes(minutes)}`} variant={editing ? 'primary' : 'secondary'} onPress={() => void save(minutes)} busy={busy} />
          <Status note={note} />
        </Card>
      )}

      <Card>
        <SectionTitle>This week</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.logs.length && <Muted>No sessions yet this week.</Muted>}
        {data?.logs.map((l) => (
          <EntryRow
            key={l.id}
            accent={ACCENT}
            title={`${SESSION_BY_ID[l.session_type].label} · ${formatMinutes(l.duration_min)}`}
            detail={[l.calm_before && `Before: ${CALM_LABELS[l.calm_before - 1]}`, l.calm_after && `after: ${CALM_LABELS[l.calm_after - 1]}`, l.note].filter(Boolean).join(' · ')}
            when={whenLabel(l.logged_at)}
            onDelete={() => void remove(l.id)}
            onEdit={() => edit(l)}
            editing={editing?.id === l.id}
          />
        ))}
      </Card>
    </TrackerScreen>
  )
}

function Calm({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <ChipRow>
        {CALM_LABELS.map((l, i) => (
          <Chip key={l} label={l} selected={value === i + 1} onPress={() => onChange(value === i + 1 ? null : i + 1)} color={ACCENT} />
        ))}
      </ChipRow>
    </View>
  )
}

const styles = StyleSheet.create({
  todayRow: { flexDirection: 'row', alignItems: 'center' },
  big: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
  timerCard: { alignItems: 'stretch', gap: 14, paddingVertical: 24 },
  clock: { fontSize: 40, fontWeight: '800', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.line, marginVertical: 4 },
})
