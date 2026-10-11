'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TrackerStorage } from '@rajs8952/core/storage'
import { DELETE_BUTTON_CLASS, WhenPicker, savedForNote, useInitialLoad, useSaving, useStore, useUndoDelete } from '@rajs8952/ui'
import { type WhenChoice, whenFromIso, whenProblem, whenToIso } from '@rajs8952/core/when'
import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
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
} from '@rajs8952/core/mood'

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
        // While unset the thumb rests on the middle; a tap there doesn't change the input's value, so no
        // change event fires. Treat that tap as choosing "Medium".
        onPointerUp={(e) => value == null && onChange(Number(e.currentTarget.value))}
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
  adapter,
  initialData,
  onCheckIn,
  banner,
}: {
  /** Where this tracker reads and writes; defaults to the <TrackerStorageProvider>'s storage. */
  adapter?: TrackerStorage['mood']
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
  const store = useStore('mood', adapter)
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mood, setMood] = useState<MoodState | null>(null)
  const [energy, setEnergy] = useState<number | null>(null)
  const [stress, setStress] = useState<number | null>(null)
  const [emotions, setEmotions] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const [saving, startSaving] = useSaving()
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!savedNote) return
    const id = setTimeout(() => setSavedNote(null), 4000)
    return () => clearTimeout(id)
  }, [savedNote])

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
  const editing = editingId ? logs.find((l) => l.id === editingId) : undefined
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
    setWhen({ day: 'now' })
    setEditingId(null)
  }

  /** Entries saved for another day leave today's list, so say where they went. */
  function noteIfNotToday(iso: string) {
    if (dayKey(new Date(iso)) !== dayKey(new Date())) setSavedNote(savedForNote(iso))
  }

  function startEdit(l: Row) {
    setMood(l.mood_state)
    setEnergy(l.energy_level)
    setStress(l.stress_level)
    setEmotions(l.emotions)
    setNote(l.note ?? '')
    setWhen(whenFromIso(l.logged_at))
    setEditingId(l.id)
    setError(null)
    // Wait a frame so the details panel has rendered before scrolling to it.
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      formRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true })
    })
  }

  function save() {
    if (!mood || whenProblem(when)) return
    const at = whenToIso(when)
    const base = { mood_state: mood, energy_level: energy, stress_level: stress, emotions, note }

    if (editingId) {
      const id = editingId
      // On an edit, an omitted time keeps the entry's own, so "Now" has to be sent explicitly.
      const input: MoodInput = { ...base, logged_at: at ?? new Date().toISOString() }
      setError(null)
      startSaving(async () => {
        const res = await store.update(id, input)
        if (res.ok) {
          setLogs((prev) =>
            prev.map((l) => (l.id === id ? { ...res.data, _key: l._key } : l)).sort((a, b) => b.logged_at.localeCompare(a.logged_at)),
          )
          reset()
          noteIfNotToday(res.data.logged_at)
        } else setError(`Your changes weren’t saved: ${res.error}`)
      })
      return
    }

    const input: MoodInput = at ? { ...base, logged_at: at } : base
    const temp: MoodLog = { id: `temp-${Date.now()}`, ...base, note: note.trim() || null, logged_at: at ?? new Date().toISOString() }
    setError(null)
    setLogs((prev) => [temp, ...prev].sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
    reset()
    noteIfNotToday(temp.logged_at)
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

  const undo = useUndoDelete()

  /** Removes it from the list now; it's really deleted once the 5-second "Undo" has passed. */
  function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    if (!removed) return
    if (id === editingId) reset()
    const restore = () => setLogs((prev) => (prev.some((l) => l.id === id) ? prev : [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at))))
    setLogs((prev) => prev.filter((l) => l.id !== id))
    undo.schedule({
      label: 'Check-in removed',
      restore,
      commit: async () => {
        const res = await store.remove(id)
        if (!res.ok) {
          restore()
          setError(`That check-in wasn’t removed: ${res.error}`)
        }
      },
    })
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
      {undo.toast}
      {banner}
      {error && <p role="alert" className="omni-notice-error">{error}</p>}

      <div ref={formRef} className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        {editing && (
          <p className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2 text-sm font-semibold">
            <span>Editing your check-in from {time(editing.logged_at)}</span>
            <button type="button" onClick={reset} className="font-bold text-muted hover:text-ink">
              Cancel
            </button>
          </p>
        )}
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
                // While editing, the face can be changed but not cleared (that would hide the form).
                onClick={() => setMood(active && !editingId ? null : m.id)}
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

                <WhenPicker value={when} onChange={setWhen} original={editing?.logged_at} />

                <div className="flex gap-2">
                  <button type="button" onClick={save} disabled={saving || whenProblem(when) != null} className="omni-btn-primary flex-1">
                    {editingId ? 'Save changes' : `Log ${MOOD_BY_ID[mood].label.toLowerCase()} mood`}
                  </button>
                  <button type="button" onClick={reset} className="omni-btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p role="status" className="text-sm font-semibold mt-3 text-emerald-700 empty:hidden">
          {savedNote}
        </p>
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
                      disabled={pending || saving}
                      onClick={() => startEdit(l)}
                      className={DELETE_BUTTON_CLASS}
                      aria-label={`Edit ${m.label.toLowerCase()} check-in from ${time(l.logged_at)}`}
                    >
                      <Pencil className="h-5 w-5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(l.id)}
                      className={DELETE_BUTTON_CLASS}
                      aria-label={`Remove ${m.label.toLowerCase()} check-in from ${time(l.logged_at)}`}
                    >
                      <Trash2 className="h-5 w-5" aria-hidden />
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
