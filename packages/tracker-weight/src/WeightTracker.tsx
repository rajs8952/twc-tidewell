'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { TrackerStorage } from '@rajs8952/core/storage'
import { useInitialLoad, useSaving, useStore } from '@rajs8952/ui'
import { storageKey } from '@rajs8952/core/persist'
import { addDays, startOfDay } from '@rajs8952/core/dates'
import {
  MAX_FAT,
  MAX_KG,
  MIN_FAT,
  MIN_KG,
  RANGES,
  formatChange,
  formatWeight,
  fromUnit,
  round1,
  toUnit,
  weightRange,
  type ActionResult,
  type WeightLog,
  type WeightUnit,
} from '@rajs8952/core/weight'

const ACCENT = '#2E9C8F'
const UNIT_KEY = storageKey('weight-unit')

/** `_key` keeps a row's React key stable when the server copy replaces the optimistic one. */
type Row = WeightLog & { _key?: string }

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
const monthOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short' })
const dayOf = (iso: string) => new Date(iso).getDate()

function readUnit(): WeightUnit {
  try {
    return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'
  } catch {
    return 'kg'
  }
}

/** Line chart of weigh-ins over the chosen window, oldest → newest. */
function TrendChart({ points, unit }: { points: Row[]; unit: WeightUnit }) {
  const W = 320
  const H = 130
  const PAD = { l: 6, r: 6, t: 14, b: 14 }
  if (points.length === 0) return null

  const times = points.map((p) => new Date(p.logged_at).getTime())
  const values = points.map((p) => toUnit(p.weight_kg, unit))
  const tMin = Math.min(...times)
  const tMax = Math.max(...times)
  const vMin = Math.min(...values)
  const vMax = Math.max(...values)
  const spread = Math.max(vMax - vMin, unit === 'kg' ? 1 : 2) // never zoom in past ±1 kg
  const mid = (vMax + vMin) / 2
  const lo = mid - spread * 0.65
  const hi = mid + spread * 0.65

  const x = (t: number) => (tMax === tMin ? W / 2 : PAD.l + ((t - tMin) / (tMax - tMin)) * (W - PAD.l - PAD.r))
  const y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t - PAD.b)
  const xy = points.map((_, i) => [x(times[i]), y(values[i])] as const)
  const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('')
  const area = `${line}L${xy[xy.length - 1][0].toFixed(1)} ${H}L${xy[0][0].toFixed(1)} ${H}Z`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="weight-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={ACCENT} stopOpacity={0.22} />
          <stop offset="1" stopColor={ACCENT} stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1={0} x2={W} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="#D3E2E0" strokeDasharray="3 4" />
      ))}
      {points.length > 1 && (
        <>
          <path d={area} fill="url(#weight-area)" />
          <motion.path
            d={line}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </>
      )}
      {xy.map(([px, py], i) => {
        const last = i === xy.length - 1
        return <circle key={points[i]._key ?? points[i].id} cx={px} cy={py} r={last ? 5 : 3} fill={last ? ACCENT : '#fff'} stroke={ACCENT} strokeWidth={2} />
      })}
    </svg>
  )
}

/** The Weight tracker module: quick weigh-in, trend chart, recent entries. */
export function WeightTracker({
  adapter,
  profileWeightKg,
  onProfileWeightChange,
  initialData,
}: {
  /** Where this tracker reads and writes; defaults to the <TrackerStorageProvider>'s storage. */
  adapter?: TrackerStorage['weight']
  /** profiles.weight_kg: the starting value before any weigh-ins exist. */
  profileWeightKg?: number
  /** Called when a weigh-in also updated the profile, so the water goal can refresh. */
  onProfileWeightChange?: (kg: number) => void
  /** Prefetched by the dashboard; omit to load standalone. */
  initialData?: ActionResult<WeightLog[]> | null
}) {
  const store = useStore('weight', adapter)
  const [logs, setLogs] = useState<Row[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, startSaving] = useSaving()

  const [unit, setUnit] = useState<WeightUnit>('kg')
  const [text, setText] = useState('')
  const [showFat, setShowFat] = useState(false)
  const [fat, setFat] = useState('')
  const [note, setNote] = useState('')
  const [syncProfile, setSyncProfile] = useState(false)
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)

  useEffect(() => setUnit(readUnit()), [])

  useInitialLoad(
    initialData,
    () => {
      const r = weightRange()
      return store.list(r)
    },
    (res) => {
      if (res.ok) {
        setLogs(res.data)
        const start = res.data[0]?.weight_kg ?? profileWeightKg
        if (start) setText(round1(toUnit(start, readUnit())).toFixed(1))
      } else setError(res.error)
      setLoaded(true)
    },
  )

  // Before the first weigh-in, start from the profile weight once it arrives.
  useEffect(() => {
    if (loaded && !text && profileWeightKg) setText(round1(toUnit(profileWeightKg, unit)).toFixed(1))
  }, [loaded, text, profileWeightKg, unit])

  const value = parseFloat(text)
  const kg = Number.isFinite(value) ? round1(fromUnit(value, unit)) : NaN
  const kgValid = Number.isFinite(kg) && kg >= MIN_KG && kg <= MAX_KG
  const fatValue = fat === '' ? null : parseFloat(fat)
  const fatValid = fatValue === null || (Number.isFinite(fatValue) && fatValue >= MIN_FAT && fatValue <= MAX_FAT)

  function switchUnit(u: WeightUnit) {
    if (u === unit) return
    if (Number.isFinite(value)) setText(round1(toUnit(fromUnit(value, unit), u)).toFixed(1))
    setUnit(u)
    try {
      localStorage.setItem(UNIT_KEY, u)
    } catch {
      /* preference just won't persist */
    }
  }

  function step(delta: number) {
    const base = Number.isFinite(value) ? value : toUnit(profileWeightKg ?? 70, unit)
    setText(Math.max(0, round1(base + delta)).toFixed(1))
  }

  function save() {
    if (!kgValid || !fatValid) return
    const input = { weight_kg: kg, body_fat_pct: fatValue === null ? null : round1(fatValue), note, sync_profile: syncProfile }
    const temp: Row = {
      id: `temp-${Date.now()}`,
      weight_kg: kg,
      body_fat_pct: input.body_fat_pct,
      note: note.trim() || null,
      logged_at: new Date().toISOString(),
    }
    setError(null)
    setNotice(null)
    setLogs((prev) => [temp, ...prev])
    setNote('')
    setFat('')
    setShowFat(false)
    startSaving(async () => {
      const res = await store.create(input)
      if (res.ok) {
        setLogs((prev) => prev.map((l) => (l.id === temp.id ? { ...res.data.log, _key: temp.id } : l)))
        if (input.sync_profile) {
          if (res.data.profileSynced) {
            onProfileWeightChange?.(kg)
            setNotice('Saved. Your water goal now uses this weight.')
          } else setNotice('Saved, but your profile weight couldn’t be updated. You can change it on the Profile page.')
        }
      } else {
        setLogs((prev) => prev.filter((l) => l.id !== temp.id))
        setError(`That weigh-in wasn’t saved: ${res.error}`)
      }
    })
  }

  async function remove(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    const res = await store.remove(id)
    if (!res.ok) {
      if (removed) setLogs((prev) => [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
      setError(`That weigh-in wasn’t removed: ${res.error}`)
    }
  }

  const inRange = useMemo(() => {
    const from = addDays(startOfDay(new Date()), -range + 1).getTime()
    return logs.filter((l) => new Date(l.logged_at).getTime() >= from).slice().reverse()
  }, [logs, range])

  if (!loaded) {
    return (
      <div className="grid animate-pulse grid-cols-1 gap-5 lg:grid-cols-2" aria-busy="true" aria-label="Loading weight tracker">
        <div className="h-64 rounded-2xl bg-white/70" />
        <div className="h-64 rounded-2xl bg-white/70" />
      </div>
    )
  }

  const latest = logs[0]
  const first = inRange[0]
  const change = latest && first && inRange.length > 1 ? latest.weight_kg - first.weight_kg : null
  const lowest = inRange.length ? Math.min(...inRange.map((l) => l.weight_kg)) : null
  const highest = inRange.length ? Math.max(...inRange.map((l) => l.weight_kg)) : null
  const recent = logs.slice(0, 5)

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="omni-notice-error">{error}</p>}
      {notice && <p role="status" className="omni-notice-ok">{notice}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-base font-bold">Weigh in</p>
            <div className="flex rounded-full bg-mist p-1" role="radiogroup" aria-label="Weight unit">
              {(['kg', 'lb'] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => switchUnit(u)}
                  className={`rounded-full px-3.5 py-1 text-sm font-bold transition ${unit === u ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => step(-0.1)}
              className="rounded-full p-3 ring-1 ring-line transition hover:bg-mist"
              aria-label={`Decrease by 0.1 ${unit}`}
            >
              <Minus className="h-5 w-5" aria-hidden />
            </motion.button>
            <div className="flex items-baseline gap-1">
              <label htmlFor="weight-value" className="sr-only">
                Weight in {unit}
              </label>
              <input
                id="weight-value"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-32 bg-transparent text-center font-display text-5xl font-bold tabular-nums outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: ACCENT }}
              />
              <span className="text-lg font-bold text-muted">{unit}</span>
            </div>
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => step(0.1)}
              className="rounded-full p-3 ring-1 ring-line transition hover:bg-mist"
              aria-label={`Increase by 0.1 ${unit}`}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </motion.button>
          </div>
          {text !== '' && !kgValid && (
            <p className="text-center text-sm font-semibold text-alert">
              Enter a weight between {formatWeight(MIN_KG, unit)} and {formatWeight(MAX_KG, unit)}.
            </p>
          )}
          {latest && kgValid && (
            <p className="text-center text-sm text-muted">
              {formatChange(kg - latest.weight_kg, unit)} since {shortDate(latest.logged_at)}
            </p>
          )}

          <AnimatePresence initial={false}>
            {showFat ? (
              <motion.div key="fat" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="overflow-hidden">
                <label htmlFor="weight-fat" className="omni-label">
                  Body fat (optional)
                </label>
                <div className="relative">
                  <input
                    id="weight-fat"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={MIN_FAT}
                    max={MAX_FAT}
                    value={fat}
                    onChange={(e) => setFat(e.target.value)}
                    className="omni-input pr-10"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">%</span>
                </div>
                {!fatValid && <p className="mt-1 text-sm font-semibold text-alert">Body fat must be between {MIN_FAT}% and {MAX_FAT}%.</p>}
              </motion.div>
            ) : (
              <button type="button" onClick={() => setShowFat(true)} className="text-sm font-bold" style={{ color: ACCENT }}>
                + Add body fat %
              </button>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="weight-note" className="sr-only">
              Note
            </label>
            <input
              id="weight-note"
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="omni-input"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={syncProfile}
              onChange={(e) => setSyncProfile(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ accentColor: ACCENT }}
            />
            <span>
              <span className="font-bold">Also use for my water goal</span>
              <span className="block text-muted">Updates the weight your daily water goal is calculated from.</span>
            </span>
          </label>

          <button type="button" onClick={save} disabled={!kgValid || !fatValid || saving} className="omni-btn-primary w-full" style={{ background: ACCENT }}>
            {kgValid ? `Log ${formatWeight(kg, unit)}` : 'Enter your weight'}
          </button>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold">Trend</p>
              <div className="flex rounded-full bg-mist p-1 text-xs font-bold" role="radiogroup" aria-label="Chart range">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={range === r}
                    onClick={() => setRange(r)}
                    className={`rounded-full px-3 py-1 transition ${range === r ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {r} days
                  </button>
                ))}
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Latest', value: latest ? formatWeight(latest.weight_kg, unit) : '—' },
                { label: `${range}-day change`, value: change === null ? '—' : formatChange(change, unit) },
                { label: 'Range', value: lowest === null ? '—' : `${round1(toUnit(lowest, unit))}–${round1(toUnit(highest!, unit))}` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-mist/70 px-2 py-2">
                  <dt className="text-[11px] font-semibold text-muted">{s.label}</dt>
                  <dd className="font-display text-sm font-bold tabular-nums">{s.value}</dd>
                </div>
              ))}
            </dl>

            <figure className="mt-3">
              {inRange.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                  No weigh-ins in the last {range} days yet.
                </p>
              ) : (
                <>
                  <TrendChart points={inRange} unit={unit} />
                  {inRange.length === 1 && <p className="mt-1 text-center text-xs text-muted">Log another weigh-in to see your trend.</p>}
                </>
              )}
              <figcaption className="sr-only">
                {inRange.length} weigh-ins in the last {range} days.
                {change !== null && ` Change ${formatChange(change, unit)}.`}
              </figcaption>
            </figure>
          </div>

          <section aria-labelledby="weight-recent">
            <h3 id="weight-recent" className="font-bold">
              Recent weigh-ins
            </h3>
            {recent.length === 0 ? (
              <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
                No weigh-ins yet. Weekly is plenty for a clear trend.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                <AnimatePresence initial={false}>
                  {recent.map((l, i) => {
                    const pending = l.id.startsWith('temp-')
                    const prev = logs[i + 1]
                    const details = [
                      prev ? `${formatChange(l.weight_kg - prev.weight_kg, unit)} vs previous` : 'First weigh-in',
                      l.body_fat_pct != null ? `${l.body_fat_pct}% body fat` : null,
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
                          <span className="text-[10px] font-bold uppercase leading-none opacity-80">{monthOf(l.logged_at)}</span>
                          <span className="text-xs font-extrabold leading-tight">{dayOf(l.logged_at)}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold">
                            {formatWeight(l.weight_kg, unit)}
                            {pending && <span className="text-xs font-semibold text-muted"> saving…</span>}
                          </p>
                          <p className="truncate text-xs text-muted">{details.join(' · ')}</p>
                        </div>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(l.id)}
                          className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                          aria-label={`Remove ${formatWeight(l.weight_kg, unit)} weigh-in from ${shortDate(l.logged_at)}`}
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
