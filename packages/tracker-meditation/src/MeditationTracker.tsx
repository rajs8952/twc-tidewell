'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Pause, Play, Square, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TrackerStorage } from '@rajs8952/core/storage'
import { useInitialLoad, useSaving, useStore } from '@rajs8952/ui'
import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
import {
  BREATH_SECONDS,
  CALM_LABELS,
  DURATIONS,
  MAX_MINUTES,
  SESSION_BY_ID,
  SESSION_TYPES,
  formatClock,
  formatMinutes,
  type MeditationInput,
  type MeditationLog,
  type SessionType,
  meditationRange,
  type ActionResult,
} from '@rajs8952/core/meditation'

const ACCENT = '#7C6BD6'
/** `_key` keeps a row's React key stable when the server copy replaces the optimistic one. */
type Row = MeditationLog & { _key?: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Soft two-note chime when a timed session ends. Silently skipped if audio is unavailable. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[523.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = ctx.currentTime + i * 0.35
      gain.gain.setValueAtTime(0, t)
      gain.gain.linearRampToValueAtTime(0.18, t + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 2.3)
    })
    setTimeout(() => ctx.close(), 3500)
  } catch {
    /* no audio: the on-screen message is enough */
  }
  navigator.vibrate?.(200)
}

function Chips<T extends string | number>({
  label,
  options,
  value,
  onChange,
  format,
}: {
  label: string
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  format: (v: T) => string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o === value
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o)}
            className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${
              active ? 'text-white' : 'bg-mist text-ink hover:bg-tide-50'
            }`}
            style={active ? { background: ACCENT } : undefined}
          >
            {format(o)}
          </button>
        )
      })}
    </div>
  )
}

/** Five-step calm rating; tap the selected step again to clear it. */
function CalmPicker({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-bold">{label}</span>
        <span className="font-semibold text-muted">{value ? CALM_LABELS[value - 1] : 'Optional'}</span>
      </div>
      <div role="radiogroup" aria-label={label} className="mt-2 grid grid-cols-5 gap-1.5">
        {CALM_LABELS.map((l, i) => {
          const level = i + 1
          const active = value === level
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={l}
              onClick={() => onChange(active ? null : level)}
              className="flex h-10 items-center justify-center rounded-xl ring-1 ring-line transition hover:ring-[#7C6BD6]"
              style={active ? { background: `${ACCENT}1F`, boxShadow: `inset 0 0 0 2px ${ACCENT}` } : undefined}
            >
              <span
                className="rounded-full"
                style={{ width: 6 + level * 3, height: 6 + level * 3, background: ACCENT, opacity: 0.35 + level * 0.13 }}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

type Phase = 'setup' | 'running' | 'paused' | 'done'

/** The Meditation tracker module: guided timer, quick log, week summary, today's sessions. */
export function MeditationTracker({
  adapter,
  initialData,
}: {
  /** Where this tracker reads and writes; defaults to the <TrackerStorageProvider>'s storage. */
  adapter?: TrackerStorage['meditation']
  /** Prefetched by the dashboard; omit to load standalone. */
  initialData?: ActionResult<MeditationLog[]> | null
} = {}) {
  const store = useStore('meditation', adapter)
  const reduce = useReducedMotion()
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useSaving()

  const [mode, setMode] = useState<'timer' | 'log'>('timer')
  const [type, setType] = useState<SessionType>('breathing')
  const [minutes, setMinutes] = useState(5)
  const [calmBefore, setCalmBefore] = useState<number | null>(null)
  const [calmAfter, setCalmAfter] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [custom, setCustom] = useState('')

  // Timer: elapsed time is derived from the clock so it stays correct in background tabs.
  const [phase, setPhase] = useState<Phase>('setup')
  const [elapsedMs, setElapsedMs] = useState(0)
  const startedAt = useRef<number | null>(null)
  const banked = useRef(0)
  const targetMs = minutes * 60_000

  const now = new Date()
  const weekStart = startOfWeek(now)

  useInitialLoad(
    initialData,
    () => {
      const r = meditationRange()
      return store.list(r)
    },
    (res) => {
      if (res.ok) setLogs(res.data)
      else setError(res.error)
      setLoaded(true)
    },
  )

  const finish = useCallback(
    (completed: boolean) => {
      const total = banked.current + (startedAt.current ? Date.now() - startedAt.current : 0)
      banked.current = completed ? targetMs : total
      startedAt.current = null
      setElapsedMs(banked.current)
      setPhase('done')
      if (completed) chime()
    },
    [targetMs],
  )

  useEffect(() => {
    if (phase !== 'running') return
    const id = setInterval(() => {
      const total = banked.current + (startedAt.current ? Date.now() - startedAt.current : 0)
      if (total >= targetMs) finish(true)
      else setElapsedMs(total)
    }, 250)
    return () => clearInterval(id)
  }, [phase, targetMs, finish])

  function start() {
    banked.current = 0
    startedAt.current = Date.now()
    setElapsedMs(0)
    setCalmAfter(null)
    setPhase('running')
  }

  function pause() {
    banked.current += startedAt.current ? Date.now() - startedAt.current : 0
    startedAt.current = null
    setElapsedMs(banked.current)
    setPhase('paused')
  }

  function resume() {
    startedAt.current = Date.now()
    setPhase('running')
  }

  function resetForm() {
    setPhase('setup')
    setElapsedMs(0)
    banked.current = 0
    setCalmBefore(null)
    setCalmAfter(null)
    setNote('')
    setCustom('')
  }

  function save(input: MeditationInput) {
    const temp: MeditationLog = {
      id: `temp-${Date.now()}`,
      duration_min: input.duration_min,
      session_type: input.session_type,
      calm_before: input.calm_before ?? null,
      calm_after: input.calm_after ?? null,
      note: input.note?.trim() || null,
      logged_at: new Date().toISOString(),
    }
    setError(null)
    setLogs((prev) => [temp, ...prev])
    resetForm()
    startSaving(async () => {
      const res = await store.create(input)
      if (res.ok) setLogs((prev) => prev.map((l) => (l.id === temp.id ? { ...res.data, _key: temp.id } : l)))
      else {
        setLogs((prev) => prev.filter((l) => l.id !== temp.id))
        setError(`That session wasn’t saved: ${res.error}`)
      }
    })
  }

  async function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    const res = await store.remove(id)
    if (!res.ok) {
      if (removed) setLogs((prev) => [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
      setError(`That session wasn’t removed: ${res.error}`)
    }
  }

  const todayKey = dayKey(now)
  const today = logs.filter((l) => dayKey(new Date(l.logged_at)) === todayKey)
  const todayMinutes = today.reduce((s, l) => s + l.duration_min, 0)

  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i)
      const k = dayKey(d)
      return {
        key: k,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
        minutes: logs.filter((l) => dayKey(new Date(l.logged_at)) === k).reduce((s, l) => s + l.duration_min, 0),
        isToday: k === todayKey,
      }
    })
    return { days, total: days.reduce((s, d) => s + d.minutes, 0), max: Math.max(10, ...days.map((d) => d.minutes)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, todayKey])

  if (!loaded) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading meditation tracker">
        <div className="h-48 rounded-2xl bg-white/70" />
        <div className="h-14 rounded-2xl bg-white/70" />
      </div>
    )
  }

  const elapsedMin = Math.floor(elapsedMs / 60_000)
  const savedMinutes = Math.min(MAX_MINUTES, Math.max(1, Math.round(elapsedMs / 60_000)))
  const tooShort = elapsedMs < 60_000
  const inhale = Math.floor(elapsedMs / 1000 / BREATH_SECONDS) % 2 === 0
  const customMin = Number(custom)
  const customValid = custom !== '' && Number.isInteger(customMin) && customMin >= 1 && customMin <= MAX_MINUTES
  const logMinutes = customValid ? customMin : minutes

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="omni-notice-error">{error}</p>}

      <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        {phase === 'setup' && (
          <div role="tablist" aria-label="How to log" className="mb-4 grid grid-cols-2 rounded-full bg-mist p-1 text-sm font-bold">
            {(['timer', 'log'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`relative rounded-full py-2 transition ${mode === m ? 'text-ink' : 'text-muted hover:text-ink'}`}
              >
                {mode === m && (
                  <motion.span
                    layoutId="meditation-mode"
                    className="absolute inset-0 rounded-full bg-white shadow-sm"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span className="relative">{m === 'timer' ? 'Timer' : 'Log a past session'}</span>
              </button>
            ))}
          </div>
        )}

        {/* Views swap instantly (fade-in only) so controls are never blocked by an exit animation. */}
        {phase === 'setup' ? (
            <motion.div
              key={`setup-${mode}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              <div>
                <p className="mb-2 text-sm font-bold">Type</p>
                <Chips label="Session type" options={SESSION_TYPES.map((s) => s.id)} value={type} onChange={setType} format={(id) => SESSION_BY_ID[id].label} />
                <p className="mt-2 text-sm text-muted">{SESSION_BY_ID[type].hint}</p>
              </div>

              <div>
                <p className="mb-2 text-sm font-bold">Length</p>
                <Chips
                  label="Length"
                  options={DURATIONS}
                  value={customValid && mode === 'log' ? -1 : minutes}
                  onChange={(m) => {
                    setMinutes(m)
                    setCustom('')
                  }}
                  format={(m) => `${m} min`}
                />
                {mode === 'log' && (
                  <div className="relative mt-2">
                    <label htmlFor="meditation-custom" className="sr-only">
                      Other length in minutes
                    </label>
                    <input
                      id="meditation-custom"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_MINUTES}
                      placeholder="Other length"
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      className="omni-input pr-14"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">min</span>
                  </div>
                )}
              </div>

              {mode === 'timer' ? (
                <>
                  <CalmPicker label="How calm are you now?" value={calmBefore} onChange={setCalmBefore} />
                  <button type="button" onClick={start} className="omni-btn-primary w-full" style={{ background: ACCENT }}>
                    <Play className="h-4 w-4" aria-hidden /> Start {minutes}-minute session
                  </button>
                </>
              ) : (
                <>
                  <CalmPicker label="How calm did you feel after?" value={calmAfter} onChange={setCalmAfter} />
                  <button
                    type="button"
                    disabled={saving || (custom !== '' && !customValid)}
                    onClick={() => save({ duration_min: logMinutes, session_type: type, calm_after: calmAfter })}
                    className="omni-btn-primary w-full"
                    style={{ background: ACCENT }}
                  >
                    Log {formatMinutes(logMinutes)} of {SESSION_BY_ID[type].label.toLowerCase()}
                  </button>
                </>
              )}
            </motion.div>
          ) : phase === 'done' ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-4"
              aria-live="polite"
            >
              <div className="text-center">
                <p className="font-display text-xl font-bold">{elapsedMs >= targetMs ? 'Session complete' : 'Session ended'}</p>
                <p className="mt-1 text-sm text-muted">
                  {tooShort
                    ? 'That was under a minute, so it won’t be saved.'
                    : `${formatMinutes(savedMinutes)} of ${SESSION_BY_ID[type].label.toLowerCase()}. Nicely done.`}
                </p>
              </div>
              {!tooShort && (
                <>
                  <CalmPicker label="How calm do you feel now?" value={calmAfter} onChange={setCalmAfter} />
                  <div>
                    <label htmlFor="meditation-note" className="sr-only">
                      Note
                    </label>
                    <input
                      id="meditation-note"
                      value={note}
                      maxLength={1000}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Add a note (optional)"
                      className="omni-input"
                    />
                  </div>
                </>
              )}
              <div className="flex gap-2">
                {!tooShort && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      save({ duration_min: savedMinutes, session_type: type, calm_before: calmBefore, calm_after: calmAfter, note })
                    }
                    className="omni-btn-primary flex-1"
                    style={{ background: ACCENT }}
                  >
                    Save session
                  </button>
                )}
                <button type="button" onClick={resetForm} className={`omni-btn-secondary ${tooShort ? 'flex-1' : ''}`}>
                  {tooShort ? 'Back' : 'Discard'}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center py-2">
              <p className="text-sm font-bold" style={{ color: ACCENT }}>
                {SESSION_BY_ID[type].label}
              </p>
              <div className="relative my-4 flex h-52 w-52 items-center justify-center">
                <motion.div
                  className="absolute inset-0 rounded-full"
                  style={{ background: `radial-gradient(circle, ${ACCENT}33 0%, ${ACCENT}10 60%, transparent 72%)` }}
                  animate={reduce || phase === 'paused' ? { scale: 0.85 } : { scale: inhale ? 1 : 0.7 }}
                  transition={{ duration: reduce ? 0 : BREATH_SECONDS, ease: 'easeInOut' }}
                  aria-hidden
                />
                <motion.div
                  className="absolute h-32 w-32 rounded-full"
                  style={{ background: `${ACCENT}26`, boxShadow: `inset 0 0 0 2px ${ACCENT}55` }}
                  animate={reduce || phase === 'paused' ? { scale: 0.9 } : { scale: inhale ? 1.18 : 0.82 }}
                  transition={{ duration: reduce ? 0 : BREATH_SECONDS, ease: 'easeInOut' }}
                  aria-hidden
                />
                <div className="relative text-center">
                  <p className="font-display text-4xl font-bold tabular-nums" aria-label={`${formatClock((targetMs - elapsedMs) / 1000)} remaining`}>
                    {formatClock((targetMs - elapsedMs) / 1000)}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-muted" aria-live="polite">
                    {phase === 'paused' ? 'Paused' : inhale ? 'Breathe in' : 'Breathe out'}
                  </p>
                </div>
              </div>
              <div
                className="mb-4 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-mist"
                role="progressbar"
                aria-label="Session progress"
                aria-valuemin={0}
                aria-valuemax={minutes}
                aria-valuenow={elapsedMin}
              >
                <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${(elapsedMs / targetMs) * 100}%`, background: ACCENT }} />
              </div>
              <div className="flex w-full max-w-[280px] gap-2">
                {phase === 'running' ? (
                  <button type="button" onClick={pause} className="omni-btn-secondary flex-1">
                    <Pause className="h-4 w-4" aria-hidden /> Pause
                  </button>
                ) : (
                  <button type="button" onClick={resume} className="omni-btn-secondary flex-1">
                    <Play className="h-4 w-4" aria-hidden /> Resume
                  </button>
                )}
                <button type="button" onClick={() => finish(false)} className="omni-btn-secondary flex-1">
                  <Square className="h-4 w-4" aria-hidden /> End
                </button>
              </div>
            </motion.div>
          )}
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold">This week</p>
          <p className="text-sm font-semibold tabular-nums text-muted">{formatMinutes(week.total)}</p>
        </div>
        <ol className="mt-3 grid h-24 grid-cols-7 items-end gap-2" aria-label="Minutes per day this week">
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

      <section aria-labelledby="meditation-today">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="meditation-today" className="font-bold">
            Today’s sessions
          </h3>
          {today.length > 0 && (
            <span className="text-sm font-semibold tabular-nums text-muted">
              {today.length} · {formatMinutes(todayMinutes)}
            </span>
          )}
        </div>
        {today.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            No sessions yet today. Even three minutes counts.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            <AnimatePresence initial={false}>
              {today.map((l) => {
                const pending = l.id.startsWith('temp-')
                const calm =
                  l.calm_before && l.calm_after
                    ? `${CALM_LABELS[l.calm_before - 1]} → ${CALM_LABELS[l.calm_after - 1].toLowerCase()}`
                    : l.calm_after
                      ? `Felt ${CALM_LABELS[l.calm_after - 1].toLowerCase()} after`
                      : null
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
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold text-white"
                      style={{ background: ACCENT }}
                    >
                      {l.duration_min}′
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {formatMinutes(l.duration_min)} {SESSION_BY_ID[l.session_type].label.toLowerCase()}{' '}
                        <span className="text-xs font-semibold text-muted">
                          {time(l.logged_at)}
                          {pending && ', saving…'}
                        </span>
                      </p>
                      {(calm || l.note) && (
                        <p className="truncate text-xs text-muted">
                          {calm}
                          {l.note && `${calm ? ' · ' : ''}${l.note}`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(l.id)}
                      className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                      aria-label={`Remove ${formatMinutes(l.duration_min)} session from ${time(l.logged_at)}`}
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
  )
}
