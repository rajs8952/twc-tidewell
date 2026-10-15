import DateTimePicker from '@react-native-community/datetimepicker'
import { hhmm } from '@rajs8952/core/when'
import { DEFAULT_NOTIFY_TIME, REMINDER_HINT, REPEAT_OPTIONS, SCHEDULE_COLUMNS, defaultEndFor, remindersPerDay } from '@omniwell/web/notifications'
import { useFocusEffect } from 'expo-router'
import { BellRing } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Linking, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import { Card, Chip, ChipRow, Muted, SectionTitle, Status, TrackerScreen } from '@/components/kit'
import { Loader } from '@/components/Loader'
import { PremiumCard } from '@/components/Support'
import { Button } from '@/components/ui'
import { usePlan } from '@/lib/plan'
import { disablePush, enablePush, pushState, unsupportedReason, type PushState } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS, TRACKER_ORDER, messageOf, type TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Reminders, as on the website (Profile → Reminders), saved to the same
 * schedules (supabase/notifications.sql, notification-repeat.sql): each
 * tracker on or off, a time, and an optional repeat through the day; plus
 * the Monday weekly recap. They reach every device the person has turned
 * notifications on for: this phone (here) and any browser (on the website).
 * Reminders are Premium.
 * ------------------------------------------------------------------ */

interface Schedule {
  tracker_type: TrackerId
  is_enabled: boolean
  notify_time: string
  repeat_every_minutes: number | null
  end_time: string | null
}

const toHHMM = (t: string) => t.slice(0, 5)
const asDate = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  const d = new Date()
  d.setHours(h ?? 9, m ?? 0, 0, 0)
  return d
}
const fmt = (t: string) => asDate(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export default function Reminders() {
  const plan = usePlan()
  const locked = !!plan && !plan.premium
  const [state, setState] = useState<PushState | null>(null)
  const [schedules, setSchedules] = useState<Record<TrackerId, Schedule> | null>(null)
  const [recapOn, setRecapOn] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      pushState().then((s) => alive && setState(s), () => alive && setState('unsupported'))
      ;(async () => {
        const { data: auth } = await supabase.auth.getUser()
        const [rows, profile] = await Promise.all([
          supabase.from('notification_schedules').select(SCHEDULE_COLUMNS),
          supabase.from('profiles').select('weekly_recap').eq('id', auth.user?.id ?? '').maybeSingle<{ weekly_recap: boolean }>(),
        ])
        if (!alive) return
        if (rows.error) setNote({ text: messageOf(rows.error), error: true })
        const saved = new Map(((rows.data ?? []) as Schedule[]).map((r) => [r.tracker_type, r]))
        setSchedules(
          Object.fromEntries(
            TRACKER_ORDER.map((t) => {
              const r = saved.get(t)
              return [t, r ? { ...r, notify_time: toHHMM(r.notify_time), end_time: r.end_time ? toHHMM(r.end_time) : null } : { tracker_type: t, is_enabled: false, notify_time: DEFAULT_NOTIFY_TIME[t], repeat_every_minutes: null, end_time: null }]
            }),
          ) as Record<TrackerId, Schedule>,
        )
        setRecapOn(profile.data?.weekly_recap ?? true)
      })().catch((e) => alive && setNote({ text: messageOf(e), error: true }))
      return () => {
        alive = false
      }
    }, []),
  )

  /** Saves one tracker's change (update, or insert the first time), as the website's saveNotificationSchedule does. */
  async function save(t: TrackerId, patch: Partial<Schedule>) {
    const before = schedules
    const next = { ...schedules![t], ...patch }
    if (next.repeat_every_minutes && !next.end_time) next.end_time = defaultEndFor(next.notify_time)
    setSchedules((s) => (s ? { ...s, [t]: next } : s))
    setNote(null)
    const row = { is_enabled: next.is_enabled, notify_time: next.notify_time, repeat_every_minutes: next.repeat_every_minutes, end_time: next.repeat_every_minutes ? next.end_time : null }
    const upd = await supabase.from('notification_schedules').update(row).eq('tracker_type', t).select('tracker_type').maybeSingle()
    let error = upd.error
    if (!error && !upd.data) {
      const { data: auth } = await supabase.auth.getUser()
      error = (await supabase.from('notification_schedules').insert({ user_id: auth.user?.id, tracker_type: t, ...row })).error
    }
    if (error) {
      setSchedules(before)
      setNote({ text: error.code === '23514' ? 'The last reminder has to be later than the first one.' : messageOf(error), error: true })
    }
  }

  async function toggleRecap(on: boolean) {
    setRecapOn(on)
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase.from('profiles').update({ weekly_recap: on }).eq('id', auth.user?.id ?? '')
    if (error) {
      setRecapOn(!on)
      setNote({ text: messageOf(error), error: true })
    }
  }

  async function phone(on: boolean) {
    setBusy('phone')
    setNote(null)
    try {
      if (on) {
        const s = await enablePush()
        setState(s)
        if (s === 'on') setNote({ text: 'Notifications are on for this phone.' })
      } else {
        await disablePush()
        setState('off')
      }
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    } finally {
      setBusy(null)
    }
  }

  if (locked) {
    return (
      <TrackerScreen>
        <PremiumCard title="Reminders" text="Gentle nudges for each tracker, which stop once you’re done for the day, are part of Premium." />
      </TrackerScreen>
    )
  }

  return (
    <TrackerScreen>
      <Card>
        <View style={styles.phoneRow}>
          <View style={[styles.icon, { backgroundColor: state === 'on' ? '#E1F2EF' : COLORS.mist }]}>
            <BellRing size={22} color={state === 'on' ? '#2E9C8F' : COLORS.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Notifications on this phone</Text>
            <Muted>
              {state === 'on'
                ? 'On. Reminders, your weekly recap and replies from your wellness team arrive here.'
                : state === 'blocked'
                  ? 'Turned off for OmniWell in your phone’s settings.'
                  : state === 'unsupported'
                    ? unsupportedReason() ?? 'Not available on this device.'
                    : 'Off. Turn them on to get your reminders here.'}
            </Muted>
          </View>
        </View>
        {state === 'off' && <Button title="Turn on notifications" onPress={() => void phone(true)} busy={busy === 'phone'} />}
        {state === 'on' && <Button title="Turn off for this phone" variant="secondary" onPress={() => void phone(false)} busy={busy === 'phone'} />}
        {state === 'blocked' && <Button title="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />}
        <Status note={note} />
      </Card>

      {!schedules ? (
        <Loader compact size={36} label={null} />
      ) : (
        <>
          <Card>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>Your week, every Monday</Text>
                <Muted>How last week went, and what to aim for this week.</Muted>
              </View>
              <Switch value={!!recapOn} onValueChange={(v) => void toggleRecap(v)} trackColor={{ true: '#2189D6', false: COLORS.line }} accessibilityLabel="Weekly recap" />
            </View>
          </Card>

          <SectionTitle>Tracker reminders</SectionTitle>
          <Muted>A reminder is skipped on days you’ve already logged that tracker.</Muted>
          {TRACKER_ORDER.map((t) => (
            <ReminderCard key={t} s={schedules[t]} onChange={(patch) => void save(t, patch)} />
          ))}
        </>
      )}
    </TrackerScreen>
  )
}

function ReminderCard({ s, onChange }: { s: Schedule; onChange: (patch: Partial<Schedule>) => void }) {
  const t = TRACKERS[s.tracker_type]
  const Icon = t.icon
  const repeats = s.repeat_every_minutes
  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: t.tint }]}>
          <Icon size={20} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t.name}</Text>
          <Muted style={{ fontSize: 13 }}>{REMINDER_HINT[s.tracker_type]}</Muted>
        </View>
        <Switch value={s.is_enabled} onValueChange={(v) => onChange({ is_enabled: v })} trackColor={{ true: t.accent, false: COLORS.line }} accessibilityLabel={`${t.name} reminder`} />
      </View>
      {s.is_enabled && (
        <View style={{ gap: 10 }}>
          <TimeRow label={repeats ? 'From' : 'At'} value={s.notify_time} onChange={(v) => onChange({ notify_time: v })} />
          <ChipRow>
            {REPEAT_OPTIONS.map((o) => (
              <Chip key={String(o.value)} label={o.label} selected={repeats === o.value} onPress={() => onChange({ repeat_every_minutes: o.value, end_time: o.value ? (s.end_time ?? defaultEndFor(s.notify_time)) : null })} color={t.accent} />
            ))}
          </ChipRow>
          {repeats && s.end_time && (
            <>
              <TimeRow label="Until" value={s.end_time} onChange={(v) => onChange({ end_time: v })} />
              <Muted style={{ fontSize: 13 }}>{remindersPerDay(s.notify_time, s.end_time, repeats)} reminders a day, from {fmt(s.notify_time)} to {fmt(s.end_time)}.</Muted>
            </>
          )}
        </View>
      )}
    </Card>
  )
}

function TimeRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <View style={styles.timeRow}>
      <Text style={styles.timeLabel}>{label}</Text>
      {Platform.OS === 'ios' ? (
        <DateTimePicker mode="time" display="compact" value={asDate(value)} onChange={(_e, d) => d && onChange(hhmm(d))} />
      ) : (
        <>
          <Pressable onPress={() => setOpen(true)} style={styles.timeButton} accessibilityRole="button" accessibilityLabel={`${label} ${fmt(value)}. Change time`}>
            <Text style={styles.timeText}>{fmt(value)}</Text>
          </Pressable>
          {open && (
            <DateTimePicker
              mode="time"
              value={asDate(value)}
              onChange={(e, d) => {
                setOpen(false)
                if (e.type === 'set' && d) onChange(hhmm(d))
              }}
            />
          )}
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeLabel: { width: 48, fontSize: 14, fontWeight: '700', color: COLORS.muted },
  timeButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.field, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
})
