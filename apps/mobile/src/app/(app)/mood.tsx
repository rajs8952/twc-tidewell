import { EMOTIONS, LEVEL_LABELS, MOODS, MOOD_BY_ID, moodRange, type MoodLog, type MoodState } from '@rajs8952/core/mood'
import { whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
import { evaluateMetric, moodInterventionKey, type Intervention } from '@rajs8952/interventions'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View, type ScrollView } from 'react-native'
import { Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, MoodFace, SectionTitle, Status, TrackerScreen, WhenPicker, whenLabel } from '@/components/kit'
import { CrisisPrompt } from '@/components/Support'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { dismiss } from '@/lib/dismissed'
import { COLORS } from '@/lib/theme'
import { TRACKERS, storage, unwrap } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'
import { WeekBars } from '@/components/WeekBars'
import { thisWeek } from '@/lib/week'

const ACCENT = TRACKERS.mood.accent
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1)

/** Each day's average mood (1–5) as a bar in that mood's colour. */
function moodWeek(logs: MoodLog[]) {
  return thisWeek(logs, (l) => l.logged_at, (l) => MOOD_BY_ID[l.mood_state].score, new Date(), (v) => v.reduce((s, x) => s + x, 0) / v.length).map((d) => ({
    ...d,
    parts: d.value ? [{ value: d.value, color: MOODS[Math.round(d.value) - 1]!.color }] : [],
  }))
}

/** Mood: how you feel, with optional energy, stress, feelings and a note; this week's check-ins. */
export default function Mood() {
  const { data, error, savedAt, refreshing, refresh, reload } = useLoad(async () => unwrap(await storage.mood.list(moodRange())), 'mood')
  const [mood, setMood] = useState<MoodState | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [emotions, setEmotions] = useState<string[]>([])
  const [text, setText] = useState('')
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  /** The crisis prompt, opened straight after an "Awful" check-in (as on the website). */
  const [crisis, setCrisis] = useState<Intervention | null>(null)
  /** The check-in being edited, if any. */
  const [editing, setEditing] = useState<MoodLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  function reset() {
    setEditing(null)
    setMood(null)
    setEnergy(null)
    setStress(null)
    setEmotions([])
    setText('')
    setWhen({ day: 'now' })
  }

  function edit(l: MoodLog) {
    setEditing(l)
    setMood(l.mood_state)
    setEnergy(l.energy_level)
    setStress(l.stress_level)
    setEmotions(l.emotions)
    setText(l.note ?? '')
    setWhen({ day: 'original', iso: l.logged_at })
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  async function save() {
    if (!mood) return setNote({ text: 'Pick how you feel first.', error: true })
    const problem = whenProblem(when)
    if (problem) return setNote({ text: problem, error: true })
    setBusy(true)
    setNote(null)
    const input = { mood_state: mood, energy_level: energy, stress_level: stress, emotions, note: text, logged_at: whenToIso(when) }
    const r = editing ? await storage.mood.update(editing.id, input) : await storage.mood.create(input)
    setBusy(false)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing) {
      setNote({ text: 'Check-in updated.' })
      reset()
      await reload()
      return
    }
    const check = evaluateMetric({ type: 'mood', value: mood })
    if (check.severity === 'CRITICAL') setCrisis(check)
    setNote({ text: 'Checked in. Thanks for taking a moment.' })
    reset()
    await reload()
  }

  async function remove(id: string) {
    const r = await storage.mood.remove(id)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing?.id === id) reset()
    await reload()
  }

  return (
    <TrackerScreen title={TRACKERS.mood.name} savedAt={savedAt} refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      <CrisisPrompt
        intervention={crisis}
        onAcknowledge={() => {
          // Also counts for Home, so the same prompt doesn't greet them there today.
          if (crisis) void dismiss(moodInterventionKey(crisis))
          setCrisis(null)
        }}
      />
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <SectionTitle>{editing ? 'Edit check-in' : 'How are you feeling?'}</SectionTitle>
        {editing && <EditingBar onCancel={reset} color={ACCENT} />}
        <View style={styles.faces}>
          {MOODS.map((m) => (
            <Pressable
              key={m.id}
              onPress={() => setMood(m.id)}
              style={[styles.face, mood === m.id && { backgroundColor: m.tint, borderColor: m.color }]}
              accessibilityRole="button"
              accessibilityState={{ selected: mood === m.id }}
              accessibilityLabel={m.label}
            >
              <MoodFace mood={m.id} size={44} />
              <Text style={[styles.faceLabel, mood === m.id && { color: m.color }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {mood && (
          <>
            <Level label="Energy" value={energy} onChange={setEnergy} />
            <Level label="Stress" value={stress} onChange={setStress} />
            <Label>Feelings (optional)</Label>
            <ChipRow>
              {EMOTIONS.map((e) => (
                <Chip key={e} label={cap(e)} selected={emotions.includes(e)} onPress={() => setEmotions((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]))} color={ACCENT} />
              ))}
            </ChipRow>
            <Field label="Note (optional)" value={text} onChangeText={setText} multiline maxLength={1000} placeholder="Anything on your mind?" style={{ minHeight: 72, textAlignVertical: 'top' }} />
            <Label>When</Label>
            <WhenPicker value={when} onChange={setWhen} color={ACCENT} original={editing?.logged_at} />
          </>
        )}
        <Button title={editing ? 'Save changes' : 'Save check-in'} onPress={() => void save()} busy={busy} disabled={!mood} />
        <Status note={note} />
      </Card>

      {data && data.length > 0 && (
        <Card>
          <SectionTitle>Your week</SectionTitle>
          <WeekBars
            days={moodWeek(data)}
            color={ACCENT}
            format={(v) => (v ? MOODS[Math.round(v) - 1]!.label : 'No check-in')}
            summary={`Mood each day this week: ${moodWeek(data).map((d) => `${d.label} ${d.value ? MOODS[Math.round(d.value) - 1]!.label : 'no check-in'}`).join(', ')}.`}
          />
          <Muted style={{ fontSize: 12 }}>Each bar is that day’s average, from Awful (lowest) to Great (highest).</Muted>
        </Card>
      )}

      <Card>
        <SectionTitle>This week</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.length && <Muted>No check-ins yet this week.</Muted>}
        {data?.map((l) => (
          <EntryRow
            key={l.id}
            accent={MOOD_BY_ID[l.mood_state].color}
            title={MOOD_BY_ID[l.mood_state].label}
            detail={[
              l.energy_level && `Energy ${LEVEL_LABELS[l.energy_level - 1]!.toLowerCase()}`,
              l.stress_level && `stress ${LEVEL_LABELS[l.stress_level - 1]!.toLowerCase()}`,
              l.emotions.length ? l.emotions.join(', ') : null,
              l.note,
            ]
              .filter(Boolean)
              .join(' · ')}
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

/** 1–5 (Very low … Very high); tap the chosen one again to clear it. */
function Level({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Label>
        {label} <Text style={styles.optional}>(optional)</Text>
      </Label>
      <ChipRow>
        {LEVEL_LABELS.map((l, i) => (
          <Chip key={l} label={l} selected={value === i + 1} onPress={() => onChange(value === i + 1 ? null : i + 1)} color={ACCENT} />
        ))}
      </ChipRow>
    </View>
  )
}

const styles = StyleSheet.create({
  faces: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  face: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: 'transparent' },
  faceLabel: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  optional: { fontWeight: '400', color: COLORS.muted },
})
