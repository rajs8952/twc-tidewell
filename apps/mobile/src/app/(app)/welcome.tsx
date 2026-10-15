import DateTimePicker from '@react-native-community/datetimepicker'
import { hhmm } from '@rajs8952/core/when'
import { DEFAULT_NOTIFY_TIME } from '@omniwell/web/notifications'
import { router } from 'expo-router'
import { BellRing, Check } from 'lucide-react-native'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, Muted, TrackerScreen } from '@/components/kit'
import { Loader } from '@/components/Loader'
import { Button, LinkButton, Notice, Title } from '@/components/ui'
import { useProfile } from '@/lib/profile'
import { enablePush, unsupportedReason } from '@/lib/push'
import { saveSchedule } from '@/lib/reminders'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS, TRACKER_ORDER, messageOf, storage, type TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * The welcome screen new accounts see once (as on the website,
 * components/onboarding/Welcome.tsx):
 *   1. What would you like to work on? (up to 3 trackers; Home lists them first)
 *   2. Reminders for those at sensible times (water every 2 hours until 9 pm),
 *      and notifications on this phone
 * Skipping is fine. Either way it's marked done (profiles.onboarded_at),
 * so it doesn't come back, on the phone or the website.
 * ------------------------------------------------------------------ */

const MAX_FOCUS = 3

const WHY: Record<TrackerId, string> = {
  water: 'More energy and focus through the day',
  mood: 'Notice how you feel, and what helps',
  sleep: 'Wake up more rested',
  meditation: 'A few calm minutes, less stress',
  exercise: 'Move more, feel stronger',
  weight: 'A steady trend over weeks',
}

/** Water nudges through the day; the rest once, at their default time. */
const REPEATS: Partial<Record<TrackerId, { every: number; until: string; label: string }>> = {
  water: { every: 120, until: '21:00', label: 'every 2 hours until 9 pm' },
}

const asDate = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const d = new Date()
  d.setHours(h ?? 9, m ?? 0, 0, 0)
  return d
}
const fmt = (t: string) => asDate(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Welcome() {
  const { profile, setProfile } = useProfile()
  const [step, setStep] = useState<1 | 2>(1)
  const [focus, setFocus] = useState<TrackerId[]>([])
  const [reminders, setReminders] = useState<Partial<Record<TrackerId, { on: boolean; time: string }>>>({})
  const [push, setPush] = useState<'off' | 'on' | 'unavailable'>(unsupportedReason() ? 'unavailable' : 'off')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!profile) return <TrackerScreen title="Welcome" back={false}>{<Loader />}</TrackerScreen>
  const first = profile.full_name.trim().split(/\s+/)[0]

  function toggle(id: TrackerId) {
    setError(null)
    setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= MAX_FOCUS ? f : [...f, id]))
  }

  function toReminders() {
    setReminders(Object.fromEntries(focus.map((id) => [id, { on: true, time: DEFAULT_NOTIFY_TIME[id] }])))
    setStep(2)
  }

  async function allowNotifications() {
    setError(null)
    try {
      const s = await enablePush()
      setPush(s === 'on' ? 'on' : s === 'unsupported' ? 'unavailable' : 'off')
      if (s === 'blocked') setError('Notifications are turned off for OmniWell in your phone’s settings. You can turn them on later.')
    } catch (e) {
      setError(messageOf(e))
    }
  }

  /** Saves the choices (or just "done", when skipping), then Home. */
  async function finish(skip = false) {
    setBusy(true)
    setError(null)
    try {
      setProfile(await storage.profile.update(profile!.id, { focus_trackers: skip ? [] : focus, onboarded_at: new Date().toISOString() }))
      if (!skip) {
        for (const id of focus) {
          const r = reminders[id]
          if (!r?.on) continue
          const repeat = REPEATS[id]
          const repeats = !!repeat && r.time < repeat.until
          await saveSchedule(id, { is_enabled: true, notify_time: r.time, repeat_every_minutes: repeats ? repeat!.every : null, end_time: repeats ? repeat!.until : null })
        }
      }
      router.replace('/')
    } catch (e) {
      setError(messageOf(e))
      setBusy(false)
    }
  }

  return (
    <TrackerScreen title="Welcome" back={false}>
      <Text style={styles.step}>Step {step} of 2</Text>
      {step === 1 ? (
        <>
          <Title>{first ? `Welcome, ${first}.` : 'Welcome.'} What would you like to work on?</Title>
          <Muted>Pick up to {MAX_FOCUS} to start with. Starting small is how habits stick; every tracker stays available.</Muted>
          {TRACKER_ORDER.map((id) => {
            const t = TRACKERS[id]
            const on = focus.includes(id)
            const full = !on && focus.length >= MAX_FOCUS
            const Icon = t.icon
            return (
              <Pressable
                key={id}
                onPress={() => toggle(id)}
                disabled={full}
                style={({ pressed }) => [styles.option, on && { borderColor: t.accent, borderWidth: 2 }, full && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: full }}
                accessibilityLabel={`${t.name}. ${WHY[id]}`}
              >
                <View style={[styles.optionIcon, { backgroundColor: t.accent }]}>
                  <Icon size={22} color={COLORS.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionName}>{t.name}</Text>
                  <Text style={styles.optionWhy}>{WHY[id]}</Text>
                </View>
                <View style={[styles.check, on ? { backgroundColor: t.accent, borderColor: t.accent } : null]}>{on && <Check size={15} color={COLORS.white} strokeWidth={3} />}</View>
              </Pressable>
            )
          })}
          {error && <Notice tone="error">{error}</Notice>}
          <Button title="Continue" onPress={toReminders} disabled={!focus.length} />
          <View style={styles.center}>
            <LinkButton title="Skip for now" onPress={() => void finish(true)} />
          </View>
        </>
      ) : (
        <>
          <Title>Want a gentle nudge?</Title>
          <Muted>Reminders help a new habit stick. Change or turn them off any time in Me → Reminders.</Muted>
          <Card>
            {focus.map((id) => {
              const t = TRACKERS[id]
              const r = reminders[id] ?? { on: true, time: DEFAULT_NOTIFY_TIME[id] }
              const repeat = REPEATS[id]
              const Icon = t.icon
              const set = (patch: Partial<{ on: boolean; time: string }>) => setReminders((all) => ({ ...all, [id]: { ...r, ...patch } }))
              return (
                <View key={id} style={styles.reminder}>
                  <View style={[styles.reminderIcon, { backgroundColor: t.tint }]}>
                    <Icon size={20} color={t.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.optionName}>{t.name}</Text>
                    <Text style={styles.optionWhy}>{repeat && r.time < repeat.until ? `From ${fmt(r.time)}, ${repeat.label}` : `Every day at ${fmt(r.time)}`}</Text>
                    {r.on && Platform.OS === 'ios' && <DateTimePicker mode="time" display="compact" value={asDate(r.time)} onValueChange={(_e, d) => set({ time: hhmm(d) })} style={{ alignSelf: 'flex-start' }} />}
                  </View>
                  <Switch value={r.on} onValueChange={(on) => set({ on })} trackColor={{ true: t.accent, false: COLORS.line }} accessibilityLabel={`${t.name} reminder`} />
                </View>
              )
            })}
          </Card>

          {push !== 'unavailable' && (
            <Card>
              <View style={styles.reminder}>
                <View style={[styles.reminderIcon, { backgroundColor: push === 'on' ? '#E1F2EF' : COLORS.mist }]}>
                  <BellRing size={20} color={push === 'on' ? '#2E9C8F' : COLORS.muted} />
                </View>
                <Text style={[styles.optionWhy, { flex: 1 }]}>{push === 'on' ? 'Notifications are on for this phone.' : 'Allow notifications so your reminders reach this phone.'}</Text>
              </View>
              {push === 'off' && <Button title="Allow notifications" variant="secondary" onPress={() => void allowNotifications()} />}
            </Card>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          <Button title="Done" onPress={() => void finish()} busy={busy} />
          <View style={styles.center}>
            <LinkButton title="‹ Back" onPress={() => setStep(1)} />
          </View>
        </>
      )}
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  step: { fontSize: 13, fontWeight: '800', color: COLORS.tide600 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, padding: 14 },
  optionIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionName: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  optionWhy: { fontSize: 14, color: COLORS.muted },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: COLORS.line, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  reminder: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  reminderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
