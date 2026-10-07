'use client'

import { AnimatePresence, motion } from 'framer-motion'
import {
  Bike,
  Dumbbell,
  Ellipsis,
  Flower2,
  Footprints,
  PersonStanding,
  Trash2,
  Trophy,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTrackerStorage } from '@omniwell/ui'
import { useSaving } from '@omniwell/ui'
import { useInitialLoad } from '@omniwell/ui'
import {
  ACTIVITIES,
  ACTIVITY_BY_ID,
  DURATIONS,
  INTENSITIES,
  MAX_MINUTES,
  WEEKLY_TARGET_MIN,
  estimateKcal,
  formatMinutes,
  type ActivityId,
  type ExerciseInput,
  type ExerciseLog,
  type Intensity,
  exerciseRange,
  type ActionResult,
} from '@omniwell/core/exercise'
import { addDays, dayKey, startOfWeek } from '@omniwell/core/dates'

const ACCENT = '#E9851F'

const ICONS: Record<ActivityId, LucideIcon> = {
  walking: Footprints,
  running: PersonStanding,
  cycling: Bike,
  swimming: Waves,
  strength: Dumbbell,
  yoga: Flower2,
  hiit: Zap,
  sports: Trophy,
  other: Ellipsis,
}

/** `_key` keeps a row's React key stable when the server copy replaces the optimistic one. */
type Row = ExerciseLog & { _key?: string }

const when = (iso: string) => {
  const d = new Date(iso)
  const today = dayKey(new Date()) === dayKey(d)
  return today
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

/** The Exercise tracker module: quick workout log, weekly active minutes, recent workouts. */
export function ExerciseTracker({
  profileWeightKg,
  initialData,
}: {
  profileWeightKg?: number
  /** Prefetched by the dashboard; omit to load standalone. */
  initialData?: ActionResult<ExerciseLog[]> | null
}) {
  const store = useTrackerStorage().exercise
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useSaving()

  const [activity, setActivity] = useState<ActivityId>('walking')
  const [minutes, setMinutes] = useState(30)
  const [custom, setCustom] = useState('')
  const [intensity, setIntensity] = useState<Intensity>('moderate')
  const [distance, setDistance] = useState('')
  const [kcalText, setKcalText] = useState('')
  const [kcalEdited, setKcalEdited] = useState(false)
  const [note, setNote] = useState('')

  const now = new Date()
  const weekStart = startOfWeek(now)

  useInitialLoad(
    initialData,
    () => {
      const r = exerciseRange()
      return store.list(r)
    },
    (res) => {
      if (res.ok) setLogs(res.data)
      else setError(res.error)
      setLoaded(true)
    },
  )

  const customMin = Number(custom)
  const customValid = custom !== '' && Number.isInteger(customMin) && customMin >= 1 && customMin <= MAX_MINUTES
  const duration = customValid ? customMin : minutes
  const estimate = profileWeightKg ? estimateKcal(activity, intensity, duration, profileWeightKg) : null
  // Until the user types their own number, the field follows the estimate.
  const kcalShown = kcalEdited ? kcalText : estimate === null ? '' : String(estimate)
  const kcalValue = kcalShown === '' ? null : Number(kcalShown)
  const kcalValid = kcalValue === null || (Number.isInteger(kcalValue) && kcalValue >= 0 && kcalValue <= 10000)
  const distValue = distance === '' ? null : Number(distance)
  const distValid = distValue === null || (Number.isFinite(distValue) && distValue >= 0 && distValue <= 1000)
  const a = ACTIVITY_BY_ID[activity]
  const canSave = (custom === '' || customValid) && kcalValid && distValid && !saving

  function save() {
    if (!canSave) return
    const input: ExerciseInput = {
      activity,
      duration_min: duration,
      intensity,
      calories_kcal: kcalValue,
      distance_km: a.distance ? distValue : null,
      note,
    }
    const temp: Row = {
      id: `temp-${Date.now()}`,
      activity,
      duration_min: duration,
      intensity,
      calories_kcal: input.calories_kcal ?? null,
      distance_km: input.distance_km ?? null,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    }
    setError(null)
    setLogs((prev) => [temp, ...prev])
    setDistance('')
    setKcalEdited(false)
    setKcalText('')
    setNote('')
    setCustom('')
    startSaving(async () => {
      const res = await store.create(input)
      if (res.ok) setLogs((prev) => prev.map((l) => (l.id === temp.id ? { ...res.data, _key: temp.id } : l)))
      else {
        setLogs((prev) => prev.filter((l) => l.id !== temp.id))
        setError(`That workout wasn’t saved: ${res.error}`)
      }
    })
  }

  async function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    const res = await store.remove(id)
    if (!res.ok) {
      if (removed) setLogs((prev) => [...prev, removed].sort((x, y) => y.logged_at.localeCompare(x.logged_at)))
      setError(`That workout wasn’t removed: ${res.error}`)
    }
  }

  const todayKey = dayKey(now)
  const week = useMemo(() => {
    const thisWeek = logs.filter((l) => new Date(l.logged_at) >= weekStart)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      const k = dayKey(d)
      return {
        key: k,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        minutes: thisWeek.filter((l) => dayKey(new Date(l.logged_at)) === k).reduce((s, l) => s + l.duration_min, 0),
        isToday: k === todayKey,
      }
    })
    return {
      days,
      minutes: thisWeek.reduce((s, l) => s + l.duration_min, 0),
      workouts: thisWeek.length,
      kcal: thisWeek.reduce((s, l) => s + (l.calories_kcal ?? 0), 0),
      max: Math.max(30, ...days.map((d) => d.minutes)),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, todayKey])

  if (!loaded) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading exercise tracker">
        <div className="h-80 rounded-2xl bg-white/70" />
        <div className="h-80 rounded-2xl bg-white/70" />
      </div>
    )
  }

  const recent = logs.slice(0, 5)
  const targetPct = Math.min(week.minutes / WEEKLY_TARGET_MIN, 1)

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="omni-notice-error">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
          <p className="font-display text-base font-bold">Log a workout</p>

          <div role="radiogroup" aria-label="Activity" className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {ACTIVITIES.map((x) => {
              const Icon = ICONS[x.id]
              const active = activity === x.id
              return (
                <motion.button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setActivity(x.id)}
                  className={`relative flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-xs font-bold ring-1 transition ${
                    active ? 'text-ink ring-2' : 'text-muted ring-line hover:bg-mist hover:text-ink'
                  }`}
                  style={active ? { background: `${ACCENT}14`, ['--tw-ring-color' as string]: ACCENT } : undefined}
                >
                  <Icon className="h-5 w-5" style={{ color: active ? ACCENT : undefined }} aria-hidden />
                  {x.label}
                </motion.button>
              )
            })}
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Duration</p>
            <div role="radiogroup" aria-label="Duration" className="flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => {
                const active = !customValid && minutes === m
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setMinutes(m)
                      setCustom('')
                    }}
                    className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${active ? 'text-white' : 'bg-mist text-ink hover:bg-tide-50'}`}
                    style={active ? { background: ACCENT } : undefined}
                  >
                    {m} min
                  </button>
                )
              })}
            </div>
            <div className="relative mt-2">
              <label htmlFor="exercise-custom" className="sr-only">
                Other duration in minutes
              </label>
              <input
                id="exercise-custom"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_MINUTES}
                placeholder="Other duration"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="omni-input pr-14"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">min</span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold">Intensity</p>
            <div role="radiogroup" aria-label="Intensity" className="grid grid-cols-3 rounded-full bg-mist p-1 text-sm font-bold">
              {INTENSITIES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="radio"
                  aria-checked={intensity === x.id}
                  onClick={() => setIntensity(x.id)}
                  className={`relative rounded-full py-2 transition ${intensity === x.id ? 'text-ink' : 'text-muted hover:text-ink'}`}
                >
                  {intensity === x.id && (
                    <motion.span
                      layoutId="exercise-intensity"
                      className="absolute inset-0 rounded-full bg-white shadow-sm"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )}
                  <span className="relative">{x.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{INTENSITIES.find((x) => x.id === intensity)?.hint}</p>
          </div>

          <div className={`grid gap-3 ${a.distance ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {a.distance && (
              <div>
                <label htmlFor="exercise-distance" className="omni-label">
                  Distance <span className="font-semibold text-muted">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    id="exercise-distance"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={0}
                    max={1000}
                    value={distance}
                    onChange={(e) => setDistance(e.target.value)}
                    className="omni-input pr-12"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">km</span>
                </div>
              </div>
            )}
            <div>
              <label htmlFor="exercise-kcal" className="omni-label">
                Calories <span className="font-semibold text-muted">(optional)</span>
              </label>
              <div className="relative">
                <input
                  id="exercise-kcal"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10000}
                  value={kcalShown}
                  onChange={(e) => {
                    setKcalEdited(true)
                    setKcalText(e.target.value)
                  }}
                  className="omni-input pr-14"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">kcal</span>
              </div>
            </div>
          </div>
          {estimate !== null && (
            <p className="-mt-1 text-xs text-muted">
              {kcalEdited ? (
                <button type="button" onClick={() => setKcalEdited(false)} className="font-bold" style={{ color: ACCENT }}>
                  Use estimate ({estimate} kcal)
                </button>
              ) : (
                <>Estimated from your weight ({profileWeightKg} kg). Edit it if your watch says otherwise.</>
              )}
            </p>
          )}
          {(!kcalValid || !distValid) && (
            <p className="text-sm font-semibold text-alert">
              {!kcalValid ? 'Calories must be a whole number up to 10,000.' : 'Distance must be between 0 and 1,000 km.'}
            </p>
          )}

          <div>
            <label htmlFor="exercise-note" className="sr-only">
              Note
            </label>
            <input
              id="exercise-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="omni-input"
            />
          </div>

          <button type="button" onClick={save} disabled={!canSave} className="omni-btn-primary w-full" style={{ background: ACCENT }}>
            Log {formatMinutes(duration)} of {a.label.toLowerCase()}
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold">This week</p>
              <p className="text-sm font-semibold tabular-nums text-muted">
                {week.workouts} {week.workouts === 1 ? 'workout' : 'workouts'}
                {week.kcal > 0 && ` · ${week.kcal.toLocaleString()} kcal`}
              </p>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-display text-2xl font-bold tabular-nums" style={{ color: ACCENT }}>
                  {formatMinutes(week.minutes)}
                </span>
                <span className="font-semibold text-muted">of {WEEKLY_TARGET_MIN} min active</span>
              </div>
              <div
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-mist"
                role="progressbar"
                aria-label="Active minutes toward the weekly guideline"
                aria-valuemin={0}
                aria-valuemax={WEEKLY_TARGET_MIN}
                aria-valuenow={Math.min(week.minutes, WEEKLY_TARGET_MIN)}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: ACCENT }}
                  initial={false}
                  animate={{ width: `${targetPct * 100}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {week.minutes >= WEEKLY_TARGET_MIN
                  ? 'Weekly guideline met. Great work.'
                  : `${WEEKLY_TARGET_MIN - week.minutes} min to the WHO weekly guideline.`}
              </p>
            </div>
            <ol className="mt-4 grid h-20 grid-cols-7 items-end gap-2" aria-label="Active minutes per day this week">
              {week.days.map((d) => (
                <li key={d.key} className="flex h-full flex-col items-center justify-end gap-1">
                  <motion.span
                    className="w-full max-w-[28px] rounded-md"
                    style={{ background: d.minutes ? ACCENT : undefined }}
                    initial={false}
                    animate={{ height: d.minutes ? `${Math.max((d.minutes / week.max) * 100, 8)}%` : 4 }}
                    transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                    title={formatMinutes(d.minutes)}
                  >
                    {!d.minutes && <span className="block h-full w-full rounded-md bg-line/70" />}
                  </motion.span>
                  <span className={`text-xs ${d.isToday ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>{d.label}</span>
                  <span className="sr-only">{d.minutes ? formatMinutes(d.minutes) : 'none'}</span>
                </li>
              ))}
            </ol>
          </div>

          <section aria-labelledby="exercise-recent">
            <h3 id="exercise-recent" className="font-bold">
              Recent workouts
            </h3>
            {recent.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                No workouts yet. A 10-minute walk is a great start.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                <AnimatePresence initial={false}>
                  {recent.map((l) => {
                    const Icon = ICONS[l.activity]
                    const pending = l.id.startsWith('temp-')
                    const details = [
                      INTENSITIES.find((x) => x.id === l.intensity)?.label,
                      l.distance_km != null ? `${l.distance_km} km` : null,
                      l.calories_kcal != null ? `${l.calories_kcal} kcal` : null,
                      l.note,
                    ].filter(Boolean)
                    return (
                      <motion.li
                        key={l._key ?? l.id}
                        layout
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.22 }}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: ACCENT }}>
                          <Icon className="h-4 w-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">
                            {formatMinutes(l.duration_min)} {ACTIVITY_BY_ID[l.activity].label.toLowerCase()}{' '}
                            <span className="text-xs font-semibold text-muted">
                              {when(l.logged_at)}
                              {pending && ', saving…'}
                            </span>
                          </p>
                          <p className="truncate text-xs text-muted">{details.join(' · ')}</p>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(l.id)}
                          className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                          aria-label={`Remove ${formatMinutes(l.duration_min)} ${ACTIVITY_BY_ID[l.activity].label.toLowerCase()} from ${when(l.logged_at)}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
