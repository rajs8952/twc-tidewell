'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTrackerStorage } from '@omniwell/ui'
import { useSaving } from '@omniwell/ui'
import { useInitialLoad } from '@omniwell/ui'
import { addDays, dayKey, startOfWeek } from '@omniwell/core/dates'
import {
  EMOTIONS,
  LEVEL_LABELS,
  MOODS,
  MOOD_BY_ID,
  type MoodInput,
  type MoodLog,
  type MoodState,
  moodRange,
  type ActionResult,
} from '@omniwell/core/mood'

/** Simple drawn face; the mouth curves from frown (1) to grin (5). */
export function MoodFace({ mood, className = 'h-10 w-10' }: { mood: MoodState; className?: string }) {
  const m = MOOD_BY_ID[mood]
  const curve = (m.score - 3) * 4 // -8 … 8
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx={20} cy={20} r={18} fill={m.tint} stroke={m.color} strokeWidth={2} />
      {m.score === 1 ? (
        <>
          <path d="M12 15l4 2M28 15l-4 2" stroke={m.color} strokeWidth={2.2} strokeLinecap="round" />
        </>
      ) : m.score === 5 ? (
        <>
          <path d="M11.5 17q2.5 -3.5 5 0M23.5 17q2.5 -3.5 5 0" stroke={m.color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx={14.5} cy={16.5} r={1.9} fill={m.color} />
          <circle cx={25.5} cy={16.5} r={1.9} fill={m.color} />
        </>
      )}
      <path
        d={`M13 ${26 - curve / 4}Q20 ${26 + curve} 27 ${26 - curve / 4}`}
        stroke={m.color}
        strokeWidth={2.4}
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LevelSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
}) {
  const id = `level-${label.toLowerCase()}`
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <label htmlFor={id} className="font-bold">
          {label}
        </label>
        {value == null ? (
          <span className="text-muted">Not set</span>
        ) : (
          <button type="button" onClick={() => onChange(null)} className="font-semibold text-muted hover:text-ink">
            {LEVEL_LABELS[value - 1]} · clear
          </button>
        )}
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={5}
        step={1}
        value={value ?? 3}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-valuetext={value == null ? 'Not set' : LEVEL_LABELS[value - 1]}
        className={`mt-2 h-2 w-full cursor-pointer accent-tide-500 ${value == null ? 'opacity-40' : ''}`}
      />
    </div>
  )
}

/** `_key` keeps a row's React key stable when the server copy replaces the optimistic one. */
type Row = MoodLog & { _key?: string }

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The Mood tracker module: quick check-in, this week at a glance, today's entries. */
export function MoodTracker({
  initialData,
  onCheckIn,
  banner,
}: {
  /** Prefetched by the dashboard; omit to load standalone. */
  initialData?: ActionResult<MoodLog[]> | null
  /**
   * Called the moment a check-in is submitted, before it saves. The host
   * uses it to react straight away, e.g. by showing a crisis prompt in `banner`.
   */
  onCheckIn?: (input: MoodInput) => void
  /** Rendered above the check-in form: the host's slot for alerts. */
  banner?: React.ReactNode
} = {}) {
  const store = useTrackerStorage().mood
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mood, setMood] = useState<MoodState | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [emotions, setEmotions] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [saving, startSaving] = useSaving()

  const now = new Date()
  const weekStart = startOfWeek(now)

  useInitialLoad(
    initialData,
    () => {
      const r = moodRange()
      return store.list(r)
    },
    (res) => {
      if (res.ok) setLogs(res.data)
      else setError(res.error)
      setLoaded(true)
    },
  )

  const todayKey = dayKey(now)
  const today = logs.filter((l) => dayKey(new Date(l.logged_at)) === todayKey)

  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = addDays(weekStart, i)
        const k = dayKey(d)
        const day = logs.filter((l) => dayKey(new Date(l.logged_at)) === k)
        const avg = day.length ? day.reduce((s, l) => s + MOOD_BY_ID[l.mood_state].score, 0) / day.length : 0
        return {
          key: k,
          label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
          mood: avg ? MOODS[Math.round(avg) - 1].id : null,
          isToday: k === todayKey,
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, todayKey],
  )

  function reset() {
    setMood(null)
    setEnergy(null)
    setStress(null)
    setEmotions([])
    setNote('')
  }

  function save() {
    if (!mood) return
    const input = { mood_state: mood, energy_level: energy, stress_level: stress, emotions, note }
    const temp: MoodLog = { id: `temp-${Date.now()}`, ...input, note: note.trim() || null, logged_at: new Date().toISOString() }
    setError(null)
    setLogs((prev) => [temp, ...prev])
    reset()
    onCheckIn?.(input)
    startSaving(async () => {
      const res = await store.create(input)
      if (res.ok) setLogs((prev) => prev.map((l) => (l.id === temp.id ? { ...res.data, _key: temp.id } : l)))
      else {
        setLogs((prev) => prev.filter((l) => l.id !== temp.id))
        setError(`That check-in wasn’t saved: ${res.error}`)
      }
    })
  }

  async function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    const res = await store.remove(id)
    if (!res.ok) {
      if (removed) setLogs((prev) => [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
      setError(`That check-in wasn’t removed: ${res.error}`)
    }
  }

  if (!loaded) {
    return (
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Loading mood tracker">
        <div className="h-20 rounded-2xl bg-white/70" />
        <div className="h-14 rounded-2xl bg-white/70" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {banner}
      {error && <p role="alert" className="omni-notice-error">{error}</p>}

      <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        <p id="mood-question" className="font-display text-base font-bold">
          How are you feeling right now?
        </p>
        <div role="radiogroup" aria-labelledby="mood-question" className="mt-3 grid grid-cols-5 gap-1.5 sm:gap-2">
          {MOODS.map((m) => {
            const active = mood === m.id
            return (
              <motion.button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                whileTap={{ scale: 0.9 }}
                onClick={() => setMood(active ? null : m.id)}
                className="relative flex flex-col items-center gap-1 rounded-xl py-2 transition"
              >
                {active && (
                  <motion.span
                    layoutId="mood-pill"
                    className="absolute inset-0 rounded-xl ring-2"
                    style={{ background: m.tint, ['--tw-ring-color' as string]: m.color }}
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <motion.span animate={{ scale: active ? 1.12 : 1 }} className="relative">
                  <MoodFace mood={m.id} className="h-10 w-10 sm:h-11 sm:w-11" />
                </motion.span>
                <span className={`relative text-xs font-bold ${active ? 'text-ink' : 'text-muted'}`}>{m.label}</span>
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence initial={false}>
          {mood && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pt-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <LevelSlider label="Energy" value={energy} onChange={setEnergy} />
                  <LevelSlider label="Stress" value={stress} onChange={setStress} />
                </div>

                <fieldset>
                  <legend className="text-sm font-bold">Anything else? (optional)</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {EMOTIONS.map((e) => {
                      const on = emotions.includes(e)
                      return (
                        <button
                          key={e}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setEmotions((prev) => (on ? prev.filter((x) => x !== e) : [...prev, e]))}
                          className={`rounded-full px-3 py-1.5 text-sm font-semibold capitalize transition ${
                            on ? 'bg-ink text-white' : 'bg-mist text-ink hover:bg-tide-50'
                          }`}
                        >
                          {e}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="mood-note" className="sr-only">
                    Note
                  </label>
                  <input
                    id="mood-note"
                    value={note}
                    maxLength={1000}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note (optional)"
                    className="omni-input"
                  />
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={save} disabled={saving} className="omni-btn-primary flex-1">
                    Log {MOOD_BY_ID[mood].label.toLowerCase()} mood
                  </button>
                  <button type="button" onClick={reset} className="omni-btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        <p className="text-sm font-bold">This week</p>
        <ol className="mt-3 grid grid-cols-7 gap-1 text-center">
          {week.map((d) => (
            <li key={d.key} className="flex flex-col items-center gap-1">
              {d.mood ? (
                <MoodFace mood={d.mood} className="h-8 w-8" />
              ) : (
                <span className="h-8 w-8 rounded-full border-2 border-dashed border-line" aria-hidden />
              )}
              <span className={`text-xs ${d.isToday ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>{d.label}</span>
              <span className="sr-only">{d.mood ? MOOD_BY_ID[d.mood].label : 'No check-in'}</span>
            </li>
          ))}
        </ol>
      </div>

      <section aria-labelledby="mood-today">
        <div className="flex items-baseline justify-between gap-3">
          <h3 id="mood-today" className="font-bold">
            Today’s check-ins
          </h3>
          {today.length > 0 && <span className="text-sm font-semibold text-muted">{today.length}</span>}
        </div>
        {today.length === 0 ? (
          <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            No check-ins yet today. Tap a face above to log one.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            <AnimatePresence initial={false}>
              {today.map((l) => {
                const m = MOOD_BY_ID[l.mood_state]
                const pending = l.id.startsWith('temp-')
                const details = [
                  l.energy_level && `Energy ${LEVEL_LABELS[l.energy_level - 1].toLowerCase()}`,
                  l.stress_level && `stress ${LEVEL_LABELS[l.stress_level - 1].toLowerCase()}`,
                  ...l.emotions,
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
                    <MoodFace mood={l.mood_state} className="h-9 w-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {m.label} <span className="text-xs font-semibold text-muted">{time(l.logged_at)}{pending && ', saving…'}</span>
                      </p>
                      {(details.length > 0 || l.note) && (
                        <p className="truncate text-xs text-muted">
                          {details.join(', ')}
                          {l.note && `${details.length ? ' · ' : ''}${l.note}`}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(l.id)}
                      className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                      aria-label={`Remove ${m.label.toLowerCase()} check-in from ${time(l.logged_at)}`}
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
