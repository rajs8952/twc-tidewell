'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WaterStore } from '@rajs8952/core/storage'
import { StreakCard, type WeekDay, savedForNote, useStore, useUndoDelete } from '@rajs8952/ui'
import type { DrinkChange } from './DrinkEditor'
import { DrinkLogger } from './DrinkLogger'
import { TodayLog } from './TodayLog'
import { WaterVessel } from './WaterVessel'
import { errorMessage } from '@rajs8952/core/errors'
import {
  addDays,
  computeStreaks,
  dayKey,
  startOfDay,
  startOfWeek,
} from '@rajs8952/core/dates'
import {
  BEVERAGES,
  effectiveGoal,
  motivationalMessage,
  type BeverageId,
} from '@rajs8952/core/hydration'
import type { DrinkLog, Profile } from '@rajs8952/core/types'

/** The water tracker module: today's glass, streak, logger and log. */
export function WaterTracker({
  profile,
  adapter,
}: {
  /** Whose goal to fill toward; null while it loads. */
  profile: Profile | null
  /** Where this tracker reads and writes; defaults to the <TrackerStorageProvider>'s storage. */
  adapter?: WaterStore
}) {
  const water = useStore('water', adapter)
  const [logs, setLogs] = useState<DrinkLog[]>([])
  const [history, setHistory] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [splash, setSplash] = useState<{ key: number; ml: number } | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [savedNote, setSavedNote] = useState<string | null>(null)
  const noteTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(noteTimer.current), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const today = startOfDay(new Date())
        const [l, h] = await Promise.all([water.list(today, addDays(today, 1)), water.dailyTotals()])
        if (!alive) return
        setLogs(l)
        setHistory(h)
        setLoaded(true)
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [water])

  const now = new Date()
  const todayKey = dayKey(now)
  const goal = profile ? effectiveGoal(profile) : 0
  const todayTotal = logs.reduce((s, l) => s + l.effective_ml, 0)
  const totals = useMemo(() => ({ ...history, [todayKey]: todayTotal }), [history, todayKey, todayTotal])
  const streaks = computeStreaks(totals, goal || Infinity, now)
  const progress = goal ? todayTotal / goal : 0
  const remaining = Math.max(goal - todayTotal, 0)

  const week: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startOfWeek(now), i)
    const k = dayKey(d)
    return {
      key: k,
      label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      progress: goal ? Math.min((totals[k] ?? 0) / goal, 1) : 0,
      isToday: k === todayKey,
      isFuture: d > now,
    }
  })

  /** Entries that land on another day don't show in today's list, so say where they went. */
  function noteSavedFor(iso: string) {
    setSavedNote(savedForNote(iso))
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(() => setSavedNote(null), 4000)
  }

  /** Off-today drinks only live in `history` (today's total comes from `logs`). */
  function shiftHistory(iso: string, deltaMl: number) {
    const k = dayKey(new Date(iso))
    if (k === dayKey(new Date())) return
    setHistory((h) => ({ ...h, [k]: Math.max((h[k] ?? 0) + deltaMl, 0) }))
  }

  const byNewest = (a: DrinkLog, b: DrinkLog) => b.logged_at.localeCompare(a.logged_at)

  async function handleAdd(beverage: BeverageId, ml: number, loggedAt?: string) {
    if (!profile) return
    if (loggedAt && dayKey(new Date(loggedAt)) !== todayKey) {
      setError(null)
      try {
        const saved = await water.add(beverage, ml, loggedAt)
        shiftHistory(saved.logged_at, saved.effective_ml)
        noteSavedFor(saved.logged_at)
      } catch (e) {
        setError(`That drink wasn’t saved: ${errorMessage(e)}`)
      }
      return
    }
    const b = BEVERAGES[beverage]
    const temp: DrinkLog = {
      id: `temp-${Date.now()}`,
      beverage,
      amount_ml: ml,
      multiplier: b.multiplier,
      effective_ml: Math.round(ml * b.multiplier),
      logged_at: loggedAt ?? new Date().toISOString(),
    }
    const before = todayTotal
    setError(null)
    setLogs((prev) => [temp, ...prev].sort(byNewest))
    setSplash({ key: Date.now(), ml: temp.effective_ml })
    if (before < goal && before + temp.effective_ml >= goal) {
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 2600)
    }
    try {
      const saved = await water.add(beverage, ml, loggedAt)
      setLogs((prev) => prev.map((x) => (x.id === temp.id ? saved : x)))
      if (loggedAt) noteSavedFor(saved.logged_at)
    } catch (e) {
      setLogs((prev) => prev.filter((x) => x.id !== temp.id))
      setError(`That drink wasn’t saved: ${errorMessage(e)}`)
    }
  }

  /** Saves an edit; a drink moved off today leaves the list and counts toward its new day instead. */
  async function handleUpdate(id: string, change: DrinkChange): Promise<boolean> {
    if (!logs.some((l) => l.id === id)) return false
    setError(null)
    try {
      const saved = await water.update(id, change)
      if (dayKey(new Date(saved.logged_at)) === dayKey(new Date())) {
        setLogs((prev) => prev.map((l) => (l.id === id ? saved : l)).sort(byNewest))
      } else {
        setLogs((prev) => prev.filter((l) => l.id !== id))
        shiftHistory(saved.logged_at, saved.effective_ml)
        noteSavedFor(saved.logged_at)
      }
      return true
    } catch (e) {
      setError(`That change wasn’t saved: ${errorMessage(e)}`)
      return false
    }
  }

  const undo = useUndoDelete()

  /** Removes it from today's list now; it's really deleted once the 5-second "Undo" has passed. */
  function handleDelete(id: string) {
    const removed = logs.find((l) => l.id === id)
    if (!removed) return
    const restore = () => setLogs((prev) => (prev.some((l) => l.id === id) ? prev : [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at))))
    setLogs((prev) => prev.filter((l) => l.id !== id))
    undo.schedule({
      label: 'Drink removed',
      restore,
      commit: async () => {
        try {
          await water.remove(id)
        } catch (e) {
          restore()
          setError(`That drink wasn’t removed: ${errorMessage(e)}`)
        }
      },
    })
  }

  if (!profile || !loaded) {
    return error ? (
      <p role="alert" className="omni-notice-error">{error}</p>
    ) : (
      <div className="grid animate-pulse gap-8 md:grid-cols-2" aria-busy="true" aria-label="Loading water tracker">
        <div className="mx-auto h-[380px] w-[240px] rounded-[48px] bg-white/70" />
        <div className="space-y-4">
          <div className="h-40 rounded-3xl bg-white/70" />
          <div className="h-64 rounded-3xl bg-white/70" />
        </div>
      </div>
    )
  }

  return (
    <>
      {undo.toast}
      {error && <p role="alert" className="omni-notice-error mb-6">{error}</p>}
      <p role="status" className={savedNote ? 'omni-notice-ok mb-6' : 'sr-only'}>
        {savedNote}
      </p>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
        <section className="flex flex-col items-center md:sticky md:top-10 md:self-start" aria-label="Today’s progress">
          <div className="relative w-full">
            <WaterVessel current={todayTotal} goal={goal} splashKey={splash?.key} celebrate={celebrate} />
            <AnimatePresence>
              {splash && (
                <motion.span
                  key={splash.key}
                  className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-ink px-3 py-1 font-display text-sm font-bold text-white"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -24 }}
                  transition={{ duration: 1.3, times: [0, 0.15, 0.7, 1] }}
                  aria-hidden
                >
                  +{splash.ml} ml
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <div className="mt-6 flex max-w-xs flex-col items-center text-center" aria-live="polite">
            <AnimatePresence>
              {progress >= 1 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-tide-100 px-3 py-1 text-sm font-bold text-tide-700"
                >
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> Goal reached
                </motion.span>
              )}
            </AnimatePresence>
            <p className="font-display text-xl font-bold leading-snug">{motivationalMessage(progress, now)}</p>
            <p className="mt-1 text-sm text-muted">
              {remaining > 0
                ? `${remaining.toLocaleString()} ml to go, about ${Math.ceil(remaining / 250)} ${Math.ceil(remaining / 250) === 1 ? 'glass' : 'glasses'}.`
                : `You’ve had ${todayTotal.toLocaleString()} ml today.`}
            </p>
          </div>
        </section>

        <div className="space-y-6">
          <StreakCard current={streaks.current} best={streaks.best} week={week} />
          <DrinkLogger onAdd={handleAdd} />
          <TodayLog logs={logs} onDelete={handleDelete} onUpdate={handleUpdate} />
        </div>
      </div>
    </>
  )
}
