'use client'

import { Bell, BellOff, BellRing, Check, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { deletePushSubscription, getNotificationSchedules, savePushSubscription, saveNotificationSchedule, sendTestNotification } from '@/app/actions/notifications'
import { ProfileSection } from '@/components/profile/ProfileSection'
import { errorMessage } from '@omniwell/core/errors'
import { REMINDER_HINT, type NotificationSchedule, type TrackerType } from '@/lib/notifications'
import { trackProgress } from '@/lib/progress'
import { pushStatus, subscribeToPush, type PushState } from '@/lib/push-client'
import { TRACKERS } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Reminder settings: a master switch that allows notifications on this
 * device (permission + Web Push subscription), and per-tracker toggles
 * with a time. Changes save straight away; times save once you stop
 * typing or leave the field. Sending the reminders is a later phase.
 * ------------------------------------------------------------------ */

const TIME_SAVE_DELAY_MS = 700
type RowStatus = { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }

const DEVICE_COPY: Record<Exclude<PushState, 'checking' | 'off' | 'on'>, string> = {
  unsupported: 'This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.',
  'ios-install': 'On iPhone and iPad, add OmniWell to your Home Screen first (Share → Add to Home Screen), then open it from there to turn on notifications.',
  'no-worker': 'OmniWell’s background service didn’t start, so notifications can’t be turned on yet. Close and reopen the app, then try again. (In a development build this is expected.)',
  denied: 'Notifications are blocked for OmniWell. Allow them in your browser’s site settings, then reload this page.',
}

/** The master "Enable browser notifications" control for this device. */
function DeviceNotifications({ state, busy, error, note, onEnable, onDisable, onTest }: {
  state: PushState
  busy: boolean
  error: string | null
  note: string | null
  onEnable: () => void
  onDisable: () => void
  onTest: () => void
}) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${state === 'on' ? 'bg-emerald-50 ring-emerald-100' : 'bg-mist/70 ring-line'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${state === 'on' ? 'bg-emerald-600 text-white' : 'bg-white text-ink'}`}>
            {state === 'on' ? <BellRing className="h-5 w-5" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
          </span>
          <div>
            <p className="font-bold">{state === 'on' ? 'Notifications are on for this device' : 'Browser notifications'}</p>
            <p className="text-sm text-muted">
              {state === 'checking'
                ? 'Checking this device…'
                : state === 'on'
                  ? 'Reminders you turn on below will arrive here.'
                  : state === 'off'
                    ? 'Allow OmniWell to send reminders to this device.'
                    : DEVICE_COPY[state]}
            </p>
          </div>
        </div>
        {state === 'off' && (
          <button type="button" onClick={onEnable} disabled={busy} className="btn-primary shrink-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Bell className="h-4 w-4" aria-hidden />}
            Enable browser notifications
          </button>
        )}
        {state === 'on' && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={onTest} disabled={busy} className="btn-secondary px-4 py-2.5">
              <Send className="h-4 w-4" aria-hidden /> Send a test
            </button>
            <button type="button" onClick={onDisable} disabled={busy} className="btn-secondary px-4 py-2.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BellOff className="h-4 w-4" aria-hidden />}
              Turn off on this device
            </button>
          </div>
        )}
      </div>
      {error && (
        <p role="alert" className="notice-error mt-3">
          {error}
        </p>
      )}
      {note && !error && (
        <p role="status" className="notice-ok mt-3">
          {note}
        </p>
      )}
    </div>
  )
}

/**
 * Switch track colours, each at least 3:1 against white (WCAG non-text
 * contrast): grey when off; the tracker's colour when on, except Exercise,
 * whose orange is too light (2.7:1) and uses a deeper step.
 */
const TRACK_OFF = '#7F979B'
const TRACK_ON_OVERRIDE: Partial<Record<TrackerType, string>> = { exercise: '#B9650E' }

/** An accessible on/off switch. */
function Toggle({ checked, onChange, label, accent }: { checked: boolean; onChange: (v: boolean) => void; label: string; accent: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      style={{ background: checked ? accent : TRACK_OFF }}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export function NotificationSettings() {
  const [schedules, setSchedules] = useState<NotificationSchedule[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<Partial<Record<TrackerType, RowStatus>>>({})
  const [push, setPush] = useState<PushState>('checking')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)
  const [pushNote, setPushNote] = useState<string | null>(null)
  const timeTimers = useRef<Partial<Record<TrackerType, ReturnType<typeof setTimeout>>>>({})
  const pendingTimes = useRef<Partial<Record<TrackerType, string>>>({})

  useEffect(() => {
    trackProgress(getNotificationSchedules())
      .then((res) => (res.ok ? setSchedules(res.data) : setLoadError(res.error)))
      .catch((e) => setLoadError(errorMessage(e)))
    pushStatus()
      .then(async ({ state, subscription }) => {
        setPush(state)
        // Keep the server's copy current (keys can rotate; a shared device may have moved to another user).
        if (state === 'on' && subscription) await savePushSubscription(subscription.toJSON(), navigator.userAgent)
      })
      .catch(() => setPush('unsupported'))
    const timers = timeTimers.current
    return () => Object.values(timers).forEach((t) => clearTimeout(t))
  }, [])

  const save = useCallback(async (tracker: TrackerType, change: { is_enabled?: boolean; notify_time?: string }) => {
    setStatus((s) => ({ ...s, [tracker]: { kind: 'saving' } }))
    try {
      const res = await saveNotificationSchedule({ tracker_type: tracker, ...change })
      if (!res.ok) throw new Error(res.error)
      setSchedules((list) => list?.map((r) => (r.tracker_type === tracker ? { ...r, saved: true } : r)) ?? list)
      setStatus((s) => ({ ...s, [tracker]: { kind: 'saved' } }))
    } catch (e) {
      setStatus((s) => ({ ...s, [tracker]: { kind: 'error', message: errorMessage(e, 'Couldn’t save. Try again.') } }))
    }
  }, [])

  const update = (tracker: TrackerType, change: Partial<NotificationSchedule>) =>
    setSchedules((list) => list?.map((r) => (r.tracker_type === tracker ? { ...r, ...change } : r)) ?? list)

  function toggle(row: NotificationSchedule, on: boolean) {
    update(row.tracker_type, { is_enabled: on })
    // Turning on for the first time also stores the time shown (the default, or one picked earlier).
    save(row.tracker_type, on && !row.saved ? { is_enabled: on, notify_time: row.notify_time } : { is_enabled: on })
  }

  /** Saves a pending time change now (on blur) or after a pause in typing. */
  function flushTime(tracker: TrackerType) {
    clearTimeout(timeTimers.current[tracker])
    const t = pendingTimes.current[tracker]
    if (t === undefined) return
    delete pendingTimes.current[tracker]
    save(tracker, { notify_time: t })
  }

  function changeTime(tracker: TrackerType, value: string) {
    update(tracker, { notify_time: value })
    if (!value) return // cleared mid-edit; wait for a full time
    pendingTimes.current[tracker] = value
    clearTimeout(timeTimers.current[tracker])
    timeTimers.current[tracker] = setTimeout(() => flushTime(tracker), TIME_SAVE_DELAY_MS)
  }

  async function enablePush() {
    setPushBusy(true)
    setPushError(null)
    try {
      const sub = await subscribeToPush()
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent)
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {})
        throw new Error(res.error)
      }
      setPush('on')
    } catch (e) {
      setPushError(errorMessage(e, 'Couldn’t turn on notifications.'))
      setPush((await pushStatus().catch(() => ({ state: 'off' as PushState }))).state)
    } finally {
      setPushBusy(false)
    }
  }

  async function testPush() {
    setPushBusy(true)
    setPushError(null)
    setPushNote(null)
    try {
      const res = await sendTestNotification()
      if (!res.ok) throw new Error(res.error)
      setPushNote(res.data.devices > 1 ? `Test sent to your ${res.data.sent} devices.` : 'Test sent. It should appear in a few seconds.')
    } catch (e) {
      setPushError(errorMessage(e, 'Couldn’t send a test.'))
    } finally {
      setPushBusy(false)
    }
  }

  async function disablePush() {
    setPushBusy(true)
    setPushError(null)
    try {
      const { subscription } = await pushStatus()
      if (subscription) {
        const res = await deletePushSubscription(subscription.endpoint)
        if (!res.ok) throw new Error(res.error)
        await subscription.unsubscribe()
      }
      setPush('off')
    } catch (e) {
      setPushError(errorMessage(e, 'Couldn’t turn off notifications.'))
    } finally {
      setPushBusy(false)
    }
  }

  const anyOn = schedules?.some((s) => s.is_enabled)

  return (
    <ProfileSection id="reminders" title="Reminders" description="Choose which trackers nudge you, and when (your local time)." icon={Bell} accent="#E8628A">
      <DeviceNotifications state={push} busy={pushBusy} error={pushError} note={pushNote} onEnable={enablePush} onDisable={disablePush} onTest={testPush} />

      {loadError ? (
        <p role="alert" className="notice-error mt-4">{loadError}</p>
      ) : !schedules ? (
        <div className="mt-4 space-y-2" aria-busy="true" aria-label="Loading reminders">
          {TRACKERS.map((t) => (
            <div key={t.id} className="h-16 rounded-2xl bg-mist/70 motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl ring-1 ring-line">
            {schedules.map((row) => {
              const t = TRACKERS.find((x) => x.id === row.tracker_type)!
              const Icon = t.icon
              const st = status[row.tracker_type]
              const timeId = `reminder-time-${row.tracker_type}`
              return (
                <li key={row.tracker_type} className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${t.accent}1F`, color: t.accent }}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{t.name}</p>
                    <p className="truncate text-xs text-muted">{REMINDER_HINT[row.tracker_type]}</p>
                  </div>
                  <span className="w-16 text-right text-[11px] font-semibold" aria-live="polite">
                    {st?.kind === 'saving' && <span className="text-muted">Saving…</span>}
                    {st?.kind === 'saved' && (
                      <span className="inline-flex items-center gap-0.5 text-emerald-700">
                        <Check className="h-3 w-3" aria-hidden /> Saved
                      </span>
                    )}
                  </span>
                  {row.is_enabled && (
                    <>
                      <label htmlFor={timeId} className="sr-only">
                        {t.name} reminder time
                      </label>
                      <input
                        id={timeId}
                        type="time"
                        value={row.notify_time}
                        onChange={(e) => changeTime(row.tracker_type, e.target.value)}
                        onBlur={() => flushTime(row.tracker_type)}
                        className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums text-ink focus:border-tide-500 focus:outline-none focus:ring-4 focus:ring-tide-200/60"
                      />
                    </>
                  )}
                  <Toggle checked={row.is_enabled} onChange={(on) => toggle(row, on)} label={`${t.name} reminders`} accent={TRACK_ON_OVERRIDE[row.tracker_type] ?? t.accent} />
                  {st?.kind === 'error' && (
                    <p role="alert" className="w-full text-xs font-semibold text-alert">
                      {st.message}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          {anyOn && push !== 'on' && push !== 'checking' && (
            <p className="mt-3 text-xs text-muted">Your choices are saved. You’ll get them once browser notifications are on for a device.</p>
          )}
        </>
      )}
    </ProfileSection>
  )
}
