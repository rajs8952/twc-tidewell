import { startOfWeek } from '@rajs8952/core/dates'
import { ACTIVITIES, ACTIVITY_BY_ID, DURATIONS, INTENSITIES, MAX_MINUTES, estimateKcal, exerciseRange, formatMinutes, type ActivityId, type ExerciseLog, type Intensity } from '@rajs8952/core/exercise'
import { goalsOf } from '@rajs8952/core/goals'
import { whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
import { useRef, useState } from 'react'
import { StyleSheet, Text, type ScrollView } from 'react-native'
import { Bar, Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, SectionTitle, Status, Stepper, TrackerScreen, WhenPicker, whenLabel } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { TRACKERS, storage, unwrap } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

const ACCENT = TRACKERS.exercise.accent

async function load() {
  const [profile, logs] = await Promise.all([loadProfile(), storage.exercise.list(exerciseRange()).then(unwrap)])
  return { goal: goalsOf(profile).exerciseWeekMin, weightKg: profile.weight_kg, logs }
}

/** Exercise: this week's minutes against the weekly goal, logging a workout, and the last two weeks. */
export default function Exercise() {
  const { data, error, refreshing, refresh, reload } = useLoad(load)
  const [activity, setActivity] = useState<ActivityId>('walking')
  const [minutes, setMinutes] = useState(30)
  const [intensity, setIntensity] = useState<Intensity>('moderate')
  const [distance, setDistance] = useState('')
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  /** The workout being edited, if any. */
  const [editing, setEditing] = useState<ExerciseLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  function edit(l: ExerciseLog) {
    setEditing(l)
    setActivity(l.activity)
    setMinutes(l.duration_min)
    setIntensity(l.intensity)
    setDistance(l.distance_km != null ? String(l.distance_km) : '')
    setWhen({ day: 'original', iso: l.logged_at })
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  function reset() {
    setEditing(null)
    setDistance('')
    setWhen({ day: 'now' })
  }

  const weekStart = startOfWeek(new Date()).getTime()
  const weekMin = data?.logs.filter((l) => new Date(l.logged_at).getTime() >= weekStart).reduce((s, l) => s + l.duration_min, 0) ?? 0
  const kcal = data?.weightKg ? estimateKcal(activity, intensity, minutes, data.weightKg) : null
  const hasDistance = ACTIVITY_BY_ID[activity].distance

  async function save() {
    const problem = whenProblem(when)
    if (problem) return setNote({ text: problem, error: true })
    const km = hasDistance && distance ? Number(distance.replace(',', '.')) : null
    if (km !== null && !Number.isFinite(km)) return setNote({ text: 'Enter the distance in km, e.g. 5.2', error: true })
    setBusy(true)
    setNote(null)
    const input = { activity, duration_min: minutes, intensity, calories_kcal: kcal, distance_km: km, note: editing?.note ?? null, logged_at: whenToIso(when) }
    const r = editing ? await storage.exercise.update(editing.id, input) : await storage.exercise.create(input)
    setBusy(false)
    if (!r.ok) return setNote({ text: r.error, error: true })
    setNote({ text: editing ? 'Workout updated.' : `Saved ${formatMinutes(minutes)} of ${ACTIVITY_BY_ID[activity].label.toLowerCase()}.` })
    reset()
    await reload()
  }

  async function remove(id: string) {
    const r = await storage.exercise.remove(id)
    if (!r.ok) return setNote({ text: r.error, error: true })
    if (editing?.id === id) reset()
    await reload()
  }

  return (
    <TrackerScreen refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <Label>This week</Label>
        <Text style={styles.big}>{formatMinutes(weekMin)}</Text>
        {data && <Muted>of your {formatMinutes(data.goal)} weekly goal{weekMin >= data.goal ? ' · goal met' : ''}</Muted>}
        {data && <Bar progress={weekMin / data.goal} color={ACCENT} />}
      </Card>

      <Card>
        <SectionTitle>{editing ? 'Edit workout' : 'Log a workout'}</SectionTitle>
        {editing && <EditingBar onCancel={reset} color={ACCENT} />}
        <Label>Activity</Label>
        <ChipRow>
          {ACTIVITIES.map((a) => (
            <Chip key={a.id} label={a.label} selected={activity === a.id} onPress={() => setActivity(a.id)} color={ACCENT} />
          ))}
        </ChipRow>
        <Label>Duration</Label>
        <ChipRow>
          {DURATIONS.map((d) => (
            <Chip key={d} label={formatMinutes(d)} selected={minutes === d} onPress={() => setMinutes(d)} color={ACCENT} />
          ))}
        </ChipRow>
        <Stepper label="Minutes" value={minutes} onChange={setMinutes} step={5} min={5} max={MAX_MINUTES} format={formatMinutes} />
        <Label>Intensity</Label>
        <ChipRow>
          {INTENSITIES.map((i) => (
            <Chip key={i.id} label={i.label} selected={intensity === i.id} onPress={() => setIntensity(i.id)} color={ACCENT} />
          ))}
        </ChipRow>
        <Muted>{INTENSITIES.find((i) => i.id === intensity)?.hint}</Muted>
        {hasDistance && <Field label="Distance in km (optional)" value={distance} onChangeText={(t) => setDistance(t.replace(/[^0-9.,]/g, '').slice(0, 6))} keyboardType="decimal-pad" placeholder="e.g. 5.2" />}
        {kcal !== null && <Muted>About {kcal.toLocaleString()} kcal, estimated from your weight.</Muted>}
        <Label>When</Label>
        <WhenPicker value={when} onChange={setWhen} color={ACCENT} original={editing?.logged_at} />
        <Button title={editing ? 'Save changes' : 'Save workout'} onPress={() => void save()} busy={busy} />
        <Status note={note} />
      </Card>

      <Card>
        <SectionTitle>Last two weeks</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.logs.length && <Muted>No workouts logged yet. A walk counts.</Muted>}
        {data?.logs.map((l) => (
          <EntryRow
            key={l.id}
            accent={ACCENT}
            title={`${ACTIVITY_BY_ID[l.activity].label} · ${formatMinutes(l.duration_min)}`}
            detail={[INTENSITIES.find((i) => i.id === l.intensity)?.label, l.distance_km != null && `${l.distance_km} km`, l.calories_kcal != null && `${l.calories_kcal} kcal`, l.note].filter(Boolean).join(' · ')}
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

const styles = StyleSheet.create({
  big: { fontSize: 26, fontWeight: '800', color: COLORS.ink },
})
