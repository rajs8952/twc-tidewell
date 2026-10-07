'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Moon, Plus, Star, Sun, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTrackerStorage } from '@omniwell/ui'
import { useSaving } from '@omniwell/ui'
import { useInitialLoad } from '@omniwell/ui'
import { addDays, dayKey, startOfWeek } from '@omniwell/core/dates'
import {
  HOURS_STEP,
  MAX_AWAKENINGS,
  MAX_HOURS,
  MIN_HOURS,
  QUALITY_LABELS,
  TARGET_MAX_HOURS,
  TARGET_MIN_HOURS,
  bedDate,
  formatDuration,
  formatTime,
  wakeDate,
  type SleepInput,
  type SleepLog,
  sleepRange,
  type ActionResult,
} from '@omniwell/core/sleep'

const ACCENT = '#4A5BC4'
const CHART_MAX_HOURS = 12

/** `_key` keeps a row's React key stable when the server copy replaces the optimistic one. */
type Row = SleepLog & { _key?: string }

const weekday = (d: Date | string) => new Date(d).toLocaleDateString(undefined, { weekday: 'short' })

/** Sensible default: 07:00 if it's already past that, otherwise "now" rounded down to 15 minutes. */
function defaultWakeTime(now = new Date()) {
  if (now.getHours() >= 7) return '07:00'
  const m = Math.floor(now.getMinutes() / 15) * 15
  return `${String(now.getHours()).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function Stars({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Sleep quality" className="flex gap-1">
      {QUALITY_LABELS.map((label, i) => {
        const level = i + 1
        const on = value !== null && level <= value
        return (
          <motion.button
            key={label}
            type="button"
            role="radio"
            aria-checked={value === level}
            aria-label={label}
            whileTap={{ scale: 0.85 }}
            onClick={() => onChange(level)}
            className="rounded-lg p-1.5 transition hover:bg-mist"
          >
            <Star className="h-7 w-7" strokeWidth={1.8} style={{ color: on ? ACCENT : '#B8C9C7', fill: on ? ACCENT : 'transparent' }} aria-hidden />
          </motion.button>
        )
      })}
    </div>
  )
}

/** The Sleep tracker module: log last night, this week's hours, recent nights. */
export function SleepTracker({ initialData }: { initialData?: ActionResult<SleepLog[]> | null } = {}) {
  const store = useTrackerStorage().sleep
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useSaving()

  const [wakeDay, setWakeDay] = useState<0 | -1>(0)
  const [wakeTime, setWakeTime] = useState(() => defaultWakeTime())
  const [hours, setHours] = useState(8)
  const [quality, setQuality] = useState<number | null>(null)
  const [awakenings, setAwakenings] = useState(0)
  const [note, setNote] = useState('')

  const now = new Date()
  const weekStart = startOfWeek(now)

  useInitialLoad(
    initialData,
    () => {
      const r = sleepRange()
      return store.list(r)
    },
    (res) => {
      if (res.ok) setLogs(res.data)
      else setError(res.error)
      setLoaded(true)
    },
  )

  const wake = wakeDate(wakeTime, wakeDay, now)
  const bed = bedDate(wake, hours)
  const inFuture = wake.getTime() > now.getTime() + 10 * 60_000

  function save() {
    if (!quality || inFuture) return
    const input: SleepInput = {
      bed_at: bed.toISOString(),
      wake_at: wake.toISOString(),
      quality,
      awakenings,
      note,
    }
    const temp: Row = {
      id: `temp-${Date.now()}`,
      bed_at: input.bed_at,
      wake_at: input.wake_at,
      duration_min: Math.round((wake.getTime() - bed.getTime()) / 60_000),
      quality,
      awakenings,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    }
    setError(null)
    setLogs((prev) => [temp, ...prev].sort((a, b) => b.wake_at.localeCompare(a.wake_at)))
    setQuality(null)
    setAwakenings(0)
    setNote('')
    startSaving(async () => {
      const res = await store.create(input)
      if (res.ok) setLogs((prev) => prev.map((l) => (l.id === temp.id ? { ...res.data, _key: temp.id } : l)))
      else {
        setLogs((prev) => prev.filter((l) => l.id !== temp.id))
        setError(`That night wasn’t saved: ${res.error}`)
      }
    })
  }

  async function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    const res = await store.remove(id)
    if (!res.ok) {
      if (removed) setLogs((prev) => [...prev, removed].sort((a, b) => b.wake_at.localeCompare(a.wake_at)))
      setError(`That night wasn’t removed: ${res.error}`)
    }
  }

  const todayKey = dayKey(now)
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      const k = dayKey(d)
      const nights = logs.filter((l) => dayKey(new Date(l.wake_at)) === k)
      const minutes = nights.reduce((s, l) => s + l.duration_min, 0)
      return { key: k, label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), hours: minutes / 60, isToday: k === todayKey }
    })
    const thisWeek = logs.filter((l) => new Date(l.wake_at) >= weekStart)
    const avgMin = thisWeek.length ? thisWeek.reduce((s, l) => s + l.duration_min, 0) / thisWeek.length : 0
    const avgQuality = thisWeek.length ? thisWeek.reduce((s, l) => s + l.quality, 0) / thisWeek.length : 0
    return { days, nights: thisWeek.length, avgMin, avgQuality }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, todayKey])

  if (!loaded) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading sleep tracker">
        <div className="h-72 rounded-2xl bg-white/70" />
        <div className="h-72 rounded-2xl bg-white/70" />
      </div>
    )
  }

  const recent = logs.slice(0, 5)
  const pct = (h: number) => `${(Math.min(h, CHART_MAX_HOURS) / CHART_MAX_HOURS) * 100}%`

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="omni-notice-error">{error}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5 rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
          <p className="font-display text-base font-bold">How did you sleep?</p>

          <div>
            <p className="mb-2 text-sm font-bold">Woke up</p>
            <div className="flex flex-col gap-2 min-[420px]:flex-row">
              <div role="radiogroup" aria-label="Wake day" className="grid flex-1 grid-cols-2 rounded-full bg-mist p-1 text-sm font-bold">
                {([0, -1] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={wakeDay === d}
                    onClick={() => setWakeDay(d)}
                    className={`relative rounded-full py-2 transition ${wakeDay === d ? 'text-ink' : 'text-muted hover:text-ink'}`}
                  >
                    {wakeDay === d && (
                      <motion.span
                        layoutId="sleep-wake-day"
                        className="absolute inset-0 rounded-full bg-white shadow-sm"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative">{d === 0 ? 'Today' : 'Yesterday'}</span>
                  </button>
                ))}
              </div>
              <label htmlFor="sleep-wake-time" className="sr-only">
                Wake time
              </label>
              <input
                id="sleep-wake-time"
                type="time"
                step={900}
                value={wakeTime}
                onChange={(e) => e.target.value && setWakeTime(e.target.value)}
                className="omni-input px-3 text-center font-bold min-[420px]:w-[9.5rem] min-[420px]:shrink-0"
              />
            </div>
            {inFuture && <p className="mt-2 text-sm font-semibold text-alert">That wake time is still ahead of now.</p>}
          </div>

          <div>
            <div className="flex items-baseline justify-between text-sm">
              <label htmlFor="sleep-hours" className="font-bold">
                Hours slept
              </label>
              <span className="font-display text-lg font-bold tabular-nums" style={{ color: ACCENT }}>
                {formatDuration(hours * 60)}
              </span>
            </div>
            <input
              id="sleep-hours"
              type="range"
              min={MIN_HOURS}
              max={MAX_HOURS}
              step={HOURS_STEP}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              aria-valuetext={formatDuration(hours * 60)}
              className="mt-2 h-2 w-full cursor-pointer"
              style={{ accentColor: ACCENT }}
            />
            <div className="mt-3 flex items-center justify-between rounded-xl bg-mist px-3 py-2 text-sm font-semibold">
              <span className="flex items-center gap-1.5">
                <Moon className="h-4 w-4" style={{ color: ACCENT }} aria-hidden />
                {weekday(bed)} {formatTime(bed)}
              </span>
              <span className="text-muted" aria-hidden>
                →
              </span>
              <span className="flex items-center gap-1.5">
                <Sun className="h-4 w-4 text-sun-600" aria-hidden />
                {weekday(wake)} {formatTime(wake)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-1 text-sm font-bold">
                Quality <span className="font-semibold text-muted">{quality ? `· ${QUALITY_LABELS[quality - 1]}` : ''}</span>
              </p>
              <Stars value={quality} onChange={setQuality} />
            </div>
            <div>
              <p id="sleep-wakeups" className="mb-1 text-sm font-bold">
                Woke up during the night
              </p>
              <div className="flex items-center gap-2" role="group" aria-labelledby="sleep-wakeups">
                <button
                  type="button"
                  onClick={() => setAwakenings((n) => Math.max(0, n - 1))}
                  disabled={awakenings === 0}
                  className="rounded-full p-2 ring-1 ring-line transition hover:bg-mist disabled:opacity-40"
                  aria-label="Fewer wake-ups"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </button>
                <span className="w-14 text-center font-display text-lg font-bold tabular-nums" aria-live="polite">
                  {awakenings}×
                </span>
                <button
                  type="button"
                  onClick={() => setAwakenings((n) => Math.min(MAX_AWAKENINGS, n + 1))}
                  className="rounded-full p-2 ring-1 ring-line transition hover:bg-mist"
                  aria-label="More wake-ups"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="sleep-note" className="sr-only">
              Note
            </label>
            <input
              id="sleep-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="omni-input"
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!quality || inFuture || saving}
            className="omni-btn-primary w-full"
            style={{ background: ACCENT }}
          >
            {quality ? `Log ${formatDuration(hours * 60)} of sleep` : 'Rate your sleep to log it'}
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-bold">This week</p>
              <p className="text-sm font-semibold tabular-nums text-muted">
                {week.nights ? `Avg ${formatDuration(week.avgMin)} · ${week.avgQuality.toFixed(1)}★` : 'No nights yet'}
              </p>
            </div>
            <div className="relative mt-4 h-36">
              {/* recommended 7–9 h band */}
              <div
                className="absolute inset-x-0 rounded-md bg-[#4A5BC4]/10"
                style={{ bottom: pct(TARGET_MIN_HOURS), height: `calc(${pct(TARGET_MAX_HOURS)} - ${pct(TARGET_MIN_HOURS)})` }}
                aria-hidden
              />
              <span className="absolute right-0 text-[10px] font-bold text-[#4A5BC4]/70" style={{ bottom: pct(TARGET_MAX_HOURS) }} aria-hidden>
                {TARGET_MIN_HOURS}–{TARGET_MAX_HOURS} h
              </span>
              <ol className="relative grid h-full grid-cols-7 items-end gap-2" aria-label="Hours slept each night this week">
                {week.days.map((d) => (
                  <li key={d.key} className="flex h-full flex-col items-center justify-end">
                    {d.hours > 0 && <span className="mb-1 text-[11px] font-bold tabular-nums text-muted">{d.hours.toFixed(1)}</span>}
                    <motion.span
                      className="w-full max-w-[28px] rounded-md"
                      style={{ background: d.hours ? ACCENT : undefined }}
                      initial={false}
                      animate={{ height: d.hours ? pct(d.hours) : 4 }}
                      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
                    >
                      {!d.hours && <span className="block h-full w-full rounded-md bg-line/70" />}
                    </motion.span>
                    <span className="sr-only">{d.hours ? formatDuration(d.hours * 60) : 'not logged'}</span>
                  </li>
                ))}
              </ol>
            </div>
            <ol className="mt-2 grid grid-cols-7 gap-2 text-center" aria-hidden>
              {week.days.map((d) => (
                <li key={d.key} className={`text-xs ${d.isToday ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>
                  {d.label}
                </li>
              ))}
            </ol>
          </div>

          <section aria-labelledby="sleep-recent">
            <h3 id="sleep-recent" className="font-bold">
              Recent nights
            </h3>
            {recent.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                No nights logged yet. Log last night to get started.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                <AnimatePresence initial={false}>
                  {recent.map((l) => {
                    const pending = l.id.startsWith('temp-')
                    const details = [
                      `${formatTime(l.bed_at)} → ${formatTime(l.wake_at)}`,
                      l.awakenings ? `woke ${l.awakenings}×` : null,
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
                        <span
                          className="flex h-9 w-12 shrink-0 flex-col items-center justify-center rounded-xl text-white"
                          style={{ background: ACCENT }}
                        >
                          <span className="text-[10px] font-bold uppercase leading-none opacity-80">{weekday(l.wake_at)}</span>
                          <span className="text-xs font-extrabold leading-tight">{(l.duration_min / 60).toFixed(1)}h</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">
                            {formatDuration(l.duration_min)}{' '}
                            <span className="text-xs font-semibold" style={{ color: ACCENT }} aria-label={`${QUALITY_LABELS[l.quality - 1]} sleep`}>
                              {'★'.repeat(l.quality)}
                            </span>
                            {pending && <span className="text-xs font-semibold text-muted"> saving…</span>}
                          </p>
                          <p className="truncate text-xs text-muted">{details.join(' · ')}</p>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(l.id)}
                          className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                          aria-label={`Remove ${formatDuration(l.duration_min)} sleep ending ${weekday(l.wake_at)} ${formatTime(l.wake_at)}`}
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
