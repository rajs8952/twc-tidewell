import { AGE, HEIGHT_CM, ageFromBirthYear, birthYearFromAge } from '@rajs8952/core/biometrics'
import { DEFAULT_GOALS, GOAL_LIMITS, validateGoals } from '@rajs8952/core/goals'
import { ACTIVITY_LEVELS, GENDERS, calculateDailyGoal, formatMl } from '@rajs8952/core/hydration'
import type { Profile } from '@rajs8952/core/types'
import { router } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, Chip, ChipRow, Label, Muted, SectionTitle, Status, Stepper, TrackerScreen } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { useProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { messageOf, storage } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Edit profile, as on the website: name, body measurements (which set
 * the water goal and BMI), the water goal and personal goals, saved
 * together to the same profile row the website uses.
 *
 * Its own screen over the tabs (from Me), not a tab: on iPhone the tab
 * bar re-measures when the keyboard opens, which made fields in a tab
 * lose focus and the keyboard close again.
 * ------------------------------------------------------------------ */

const hours = (min: number) => `${min / 60} h`

export default function EditProfile() {
  const { profile, setProfile, error: loadError } = useProfile()
  /** The edits so far, over the saved profile. */
  const [edits, setEdits] = useState<Partial<Profile>>({})
  const [ageText, setAgeText] = useState<string | null>(null)
  const [customOn, setCustomOn] = useState<boolean | null>(null)
  const [heightText, setHeightText] = useState<string | null>(null)
  const [weightText, setWeightText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  if (!profile) {
    return <TrackerScreen title={'Edit profile'}>{loadError ? <Notice tone="error">{loadError}</Notice> : <Loader label="Loading your profile…" />}</TrackerScreen>
  }

  const saved = profile
  const form: Profile = { ...profile, ...edits }
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setNote(null)
    setEdits((e) => ({ ...e, [k]: v }))
  }
  const age = ageText ?? ageFromBirthYear(profile.birth_year)?.toString() ?? ''
  const custom = customOn ?? profile.custom_goal_ml != null
  const height = heightText ?? (profile.height_cm ? String(profile.height_cm) : '')
  const weight = weightText ?? String(profile.weight_kg)
  const smartGoal = calculateDailyGoal({ weightKg: Number(weight) || profile.weight_kg, gender: form.gender, activity: form.activity_level })
  const hasGoals = profile.goal_sleep_min !== undefined

  async function save() {
    const w = Number(weight.replace(',', '.'))
    const h = height.trim() ? Number(height.replace(',', '.')) : null
    const a = age.trim() ? Number(age) : null
    if (!form.full_name.trim()) return setNote({ text: 'Add your name.', error: true })
    if (!(w >= 25 && w <= 300)) return setNote({ text: 'Enter a weight between 25 and 300 kg.', error: true })
    if (h != null && !(h >= HEIGHT_CM.min && h <= HEIGHT_CM.max)) return setNote({ text: `Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.`, error: true })
    if (a != null && !(Number.isInteger(a) && a >= AGE.min && a <= AGE.max)) return setNote({ text: `Enter an age between ${AGE.min} and ${AGE.max}, in whole years.`, error: true })
    const goalMl = custom ? form.custom_goal_ml : null
    if (custom && !(goalMl && goalMl >= 500 && goalMl <= 8000)) return setNote({ text: 'Set a custom water goal between 500 and 8,000 ml.', error: true })
    if (hasGoals) {
      const check = validateGoals({ sleepMin: form.goal_sleep_min ?? NaN, meditationMin: form.goal_meditation_min ?? NaN, exerciseWeekMin: form.goal_exercise_week_min ?? NaN })
      if (!check.ok) return setNote({ text: check.error, error: true })
    }
    setBusy(true)
    setNote(null)
    try {
      // Keep the stored birth year when the age hasn't changed, so saving doesn't nudge it.
      const birthYear = a == null ? null : a === ageFromBirthYear(saved.birth_year) ? saved.birth_year : birthYearFromAge(a)
      setProfile(
        await storage.profile.update(saved.id, {
          full_name: form.full_name.trim(),
          weight_kg: w,
          height_cm: h,
          birth_year: birthYear,
          gender: form.gender,
          activity_level: form.activity_level,
          custom_goal_ml: goalMl,
          ...(hasGoals ? { goal_sleep_min: form.goal_sleep_min, goal_meditation_min: form.goal_meditation_min, goal_exercise_week_min: form.goal_exercise_week_min } : {}),
        }),
      )
      router.back()
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
      setBusy(false)
    }
  }

  return (
    <TrackerScreen title={'Edit profile'}>
      <Card>
        <Field label="Name" value={form.full_name} onChangeText={(v) => set('full_name', v)} autoCapitalize="words" maxLength={80} textContentType="name" />
      </Card>

      <Card>
        <SectionTitle>Your body</SectionTitle>
        <Muted>Used for your water goal and BMI. Only you can see it.</Muted>
        <Field label="Height (cm)" value={height} onChangeText={(t) => (setNote(null), setHeightText(t.replace(/[^0-9.,]/g, '').slice(0, 5)))} keyboardType="decimal-pad" placeholder="e.g. 170" />
        <Field label="Weight (kg)" value={weight} onChangeText={(t) => (setNote(null), setWeightText(t.replace(/[^0-9.,]/g, '').slice(0, 6)))} keyboardType="decimal-pad" />
        <Field label="Age (optional)" value={age} onChangeText={(t) => (setNote(null), setAgeText(t.replace(/\D/g, '').slice(0, 3)))} keyboardType="number-pad" />
        <Label>Sex</Label>
        <ChipRow>
          {GENDERS.map((g) => (
            <Chip key={g.id} label={g.label} selected={form.gender === g.id} onPress={() => set('gender', g.id)} />
          ))}
        </ChipRow>
        <Label>How active are you?</Label>
        <ChipRow>
          {ACTIVITY_LEVELS.map((a) => (
            <Chip key={a.id} label={a.label} selected={form.activity_level === a.id} onPress={() => set('activity_level', a.id)} />
          ))}
        </ChipRow>
        <Muted>{ACTIVITY_LEVELS.find((a) => a.id === form.activity_level)?.hint}</Muted>
      </Card>

      <Card>
        <SectionTitle>Water goal</SectionTitle>
        <Muted>Your smart goal is {formatMl(smartGoal)} a day, from your weight, sex and activity.</Muted>
        <View style={styles.switchRow}>
          <Text style={[styles.label, { flex: 1 }]}>Set my own goal instead</Text>
          <Switch
            value={custom}
            onValueChange={(v) => {
              setNote(null)
              setCustomOn(v)
              if (v && form.custom_goal_ml == null) set('custom_goal_ml', smartGoal)
            }}
            trackColor={{ true: '#2189D6', false: COLORS.line }}
            accessibilityLabel="Set my own water goal"
          />
        </View>
        {custom && <Stepper label="Daily water goal" value={form.custom_goal_ml ?? smartGoal} onChange={(v) => set('custom_goal_ml', v)} step={100} min={500} max={8000} format={formatMl} />}
      </Card>

      {hasGoals && (
        <Card>
          <SectionTitle>Your goals</SectionTitle>
          <Muted>What “goal met” means on Home. Logging always counts, whatever the number.</Muted>
          <Label>Sleep a night</Label>
          <Stepper label="Sleep goal" value={form.goal_sleep_min ?? DEFAULT_GOALS.sleepMin} onChange={(v) => set('goal_sleep_min', v)} step={30} min={GOAL_LIMITS.sleepMin.min} max={GOAL_LIMITS.sleepMin.max} format={hours} />
          <Label>Meditation a day</Label>
          <Stepper label="Meditation goal" value={form.goal_meditation_min ?? DEFAULT_GOALS.meditationMin} onChange={(v) => set('goal_meditation_min', v)} step={1} min={GOAL_LIMITS.meditationMin.min} max={GOAL_LIMITS.meditationMin.max} format={(v) => `${v} min`} />
          <Label>Exercise a week</Label>
          <Stepper label="Exercise goal" value={form.goal_exercise_week_min ?? DEFAULT_GOALS.exerciseWeekMin} onChange={(v) => set('goal_exercise_week_min', v)} step={10} min={GOAL_LIMITS.exerciseWeekMin.min} max={GOAL_LIMITS.exerciseWeekMin.max} format={(v) => `${v} min`} />
          <Muted style={{ fontSize: 13 }}>The WHO suggests at least 150 minutes of moderate activity a week.</Muted>
          <Pressable
            onPress={() => {
              set('goal_sleep_min', DEFAULT_GOALS.sleepMin)
              set('goal_meditation_min', DEFAULT_GOALS.meditationMin)
              set('goal_exercise_week_min', DEFAULT_GOALS.exerciseWeekMin)
            }}
            accessibilityRole="button"
          >
            <Text style={styles.link}>Use the recommended goals</Text>
          </Pressable>
        </Card>
      )}

      <Status note={note} />
      <Button title="Save changes" onPress={() => void save()} busy={busy} />
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  link: { fontSize: 14, fontWeight: '700', color: COLORS.tide600 },
})
