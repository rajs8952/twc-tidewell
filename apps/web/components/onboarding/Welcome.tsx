'use client'

import { ArrowRight, Bell, BellRing, Check, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { saveNotificationSchedule, savePushSubscription } from '@/app/actions/notifications'
import { errorMessage } from '@rajs8952/core/errors'
import { updateProfileRow } from '@rajs8952/storage/supabase'
import { getProfile } from '@/lib/data'
import { DEFAULT_NOTIFY_TIME, type TrackerType } from '@/lib/notifications'
import { pushStatus, subscribeToPush, type PushState } from '@/lib/push-client'
import { createClient } from '@/lib/supabase/client'
import { TRACKERS, type TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * The welcome screen new employees see once after signing up:
 *   1. What would you like to work on? (pick up to 3 trackers)
 *   2. Reminders for those, at sensible times (water: every 2 h until 9 pm)
 * Then Home, which lists the chosen trackers first. Skipping is fine; it
 * can be opened again from Home's first-week checklist.
 * ------------------------------------------------------------------ */

const MAX_FOCUS = 3

/** Why each tracker might be the one to start with. */
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

export function Welcome() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')
  const [focus, setFocus] = useState<TrackerId[]>([])
  const [reminders, setReminders] = useState<Partial<Record<TrackerId, { on: boolean; time: string }>>>({})
  const [push, setPush] = useState<PushState>('checking')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getProfile(supabase)
      .then((p) => {
        setProfileId(p.id)
        setFirstName(p.full_name.split(' ')[0] ?? '')
        if (p.focus_trackers?.length) setFocus(p.focus_trackers.filter((t): t is TrackerId => TRACKERS.some((x) => x.id === t)).slice(0, MAX_FOCUS))
      })
      .catch((e) => setError(errorMessage(e)))
    pushStatus()
      .then(({ state }) => setPush(state))
      .catch(() => setPush('unsupported'))
  }, [supabase])

  function toggle(id: TrackerId) {
    setError(null)
    setFocus((f) => (f.includes(id) ? f.filter((x) => x !== id) : f.length >= MAX_FOCUS ? f : [...f, id]))
  }

  function toReminders() {
    setReminders(Object.fromEntries(focus.map((id) => [id, { on: true, time: DEFAULT_NOTIFY_TIME[id as TrackerType] }])))
    setStep(2)
  }

  async function allowNotifications() {
    setError(null)
    try {
      const sub = await subscribeToPush()
      const res = await savePushSubscription(sub.toJSON(), navigator.userAgent)
      if (!res.ok) throw new Error(res.error)
      setPush('on')
    } catch (e) {
      setError(errorMessage(e, 'Couldn’t turn on notifications. You can do it later in Profile.'))
      setPush((await pushStatus().catch(() => ({ state: 'off' as PushState }))).state)
    }
  }

  /** Saves the choices (or just "done", when skipping) and goes Home. */
  async function finish(skip = false) {
    if (!profileId) return
    setBusy(true)
    setError(null)
    try {
      await updateProfileRow(supabase, profileId, { focus_trackers: skip ? [] : focus, onboarded_at: new Date().toISOString() })
      if (!skip) {
        for (const id of focus) {
          const r = reminders[id]
          if (!r?.on) continue
          const repeat = REPEATS[id]
          const res = await saveNotificationSchedule({
            tracker_type: id as TrackerType,
            is_enabled: true,
            notify_time: r.time,
            ...(repeat && r.time < repeat.until ? { repeat_every_minutes: repeat.every, end_time: repeat.until } : {}),
          })
          if (!res.ok) throw new Error(res.error)
        }
      }
      router.replace('/dashboard')
      router.refresh()
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm font-bold text-tide-600">Step {step} of 2</p>
      {step === 1 ? (
        <>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{firstName ? `Welcome, ${firstName}.` : 'Welcome.'} What would you like to work on?</h1>
          <p className="mt-2 text-muted">Pick up to {MAX_FOCUS} to start with. Starting small is how habits stick; every tracker stays available.</p>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Trackers to focus on">
            {TRACKERS.map((t) => {
              const on = focus.includes(t.id)
              const full = !on && focus.length >= MAX_FOCUS
              const Icon = t.icon
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => toggle(t.id)}
                    className={`flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-2 transition disabled:opacity-40 ${on ? '' : 'ring-line hover:ring-ink/20'}`}
                    style={on ? { ['--tw-ring-color' as string]: t.accent } : undefined}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: t.accent }}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{t.name}</span>
                      <span className="block text-sm text-muted">{WHY[t.id]}</span>
                    </span>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${on ? 'text-white' : 'ring-2 ring-line'}`} style={on ? { background: t.accent } : undefined} aria-hidden>
                      {on && <Check className="h-4 w-4" strokeWidth={3} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          {error && <p role="alert" className="notice-error mt-4">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary px-6 py-3" disabled={!focus.length || !profileId} onClick={toReminders}>
              Continue <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className="text-sm font-bold text-muted hover:text-ink" disabled={busy || !profileId} onClick={() => finish(true)}>
              Skip for now
            </button>
          </div>
        </>
      ) : (
        <>
          <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">Want a gentle nudge?</h1>
          <p className="mt-2 text-muted">Reminders help a new habit stick. Change or turn them off any time in Profile.</p>

          <ul className="mt-6 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {focus.map((id) => {
              const t = TRACKERS.find((x) => x.id === id)!
              const r = reminders[id] ?? { on: true, time: DEFAULT_NOTIFY_TIME[id as TrackerType] }
              const Icon = t.icon
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${t.accent}1F`, color: t.accent }}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{t.name}</p>
                    <p className="text-xs text-muted">{REPEATS[id] && r.time < REPEATS[id]!.until ? `From ${r.time}, ${REPEATS[id]!.label}` : `Every day at ${r.time}`}</p>
                  </div>
                  {r.on && (
                    <>
                      <label htmlFor={`welcome-time-${id}`} className="sr-only">
                        {t.name} reminder time
                      </label>
                      <input
                        id={`welcome-time-${id}`}
                        type="time"
                        value={r.time}
                        onChange={(e) => e.target.value && setReminders((all) => ({ ...all, [id]: { ...r, time: e.target.value } }))}
                        className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums"
                      />
                    </>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={r.on}
                    aria-label={`${t.name} reminders`}
                    onClick={() => setReminders((all) => ({ ...all, [id]: { ...r, on: !r.on } }))}
                    className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition"
                    style={{ background: r.on ? t.accent : '#7F979B' }}
                  >
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${r.on ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className={`mt-4 flex flex-wrap items-center gap-3 rounded-2xl p-4 ring-1 ${push === 'on' ? 'bg-emerald-50 ring-emerald-100' : 'bg-mist/70 ring-line'}`}>
            {push === 'on' ? <BellRing className="h-5 w-5 text-emerald-700" aria-hidden /> : <Bell className="h-5 w-5" aria-hidden />}
            <p className="min-w-0 flex-1 text-sm">
              {push === 'on'
                ? 'Notifications are on for this device.'
                : push === 'off'
                  ? 'Allow OmniWell to send reminders to this device.'
                  : push === 'ios-install'
                    ? 'On iPhone, add OmniWell to your Home Screen first (Share → Add to Home Screen) to get reminders.'
                    : push === 'checking'
                      ? 'Checking this device…'
                      : 'This browser can’t show reminders. Your choices are saved for when you use one that can.'}
            </p>
            {push === 'off' && (
              <button type="button" className="btn-secondary px-4 py-2" onClick={allowNotifications}>
                Allow notifications
              </button>
            )}
          </div>

          {error && <p role="alert" className="notice-error mt-4">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary px-6 py-3" disabled={busy} onClick={() => finish(false)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Start using OmniWell <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button type="button" className="text-sm font-bold text-muted hover:text-ink" disabled={busy} onClick={() => setStep(1)}>
              Back
            </button>
          </div>
        </>
      )}
    </div>
  )
}
