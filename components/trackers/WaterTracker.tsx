'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DrinkLogger } from '@/components/DrinkLogger'
import { StreakCard, type WeekDay } from '@/components/StreakCard'
import { TodayLog } from '@/components/TodayLog'
import { WaterVessel } from '@/components/WaterVessel'
import { addLog, deleteLog, getDailyTotals, getLogsBetween } from '@/lib/data'
import { errorMessage } from '@/lib/errors'
import {
  BEVERAGES,
  addDays,
  computeStreaks,
  dayKey,
  effectiveGoal,
  motivationalMessage,
  startOfDay,
  startOfWeek,
  type BeverageId,
} from '@/lib/hydration'
import { createClient } from '@/lib/supabase/client'
import type { DrinkLog, Profile } from '@/lib/types'

/** The water tracker module: today's glass, streak, logger and log. */
export function WaterTracker({ profile }: { profile: Profile | null }) {
  const supabase = useMemo(() => createClient(), [])
  const [logs, setLogs] = useState<DrinkLog[]>([])
  const [history, setHistory] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [splash, setSplash] = useState<{ key: number; ml: number } | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const today = startOfDay(new Date())
        const [l, h] = await Promise.all([getLogsBetween(supabase, today, addDays(today, 1)), getDailyTotals(supabase)])
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
  }, [supabase])

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

  async function handleAdd(beverage: BeverageId, ml: number) {
    if (!profile) return
    const b = BEVERAGES[beverage]
    const temp: DrinkLog = {
      id: `temp-${Date.now()}`,
      beverage,
      amount_ml: ml,
      multiplier: b.multiplier,
      effective_ml: Math.round(ml * b.multiplier),
      logged_at: new Date().toISOString(),
    }
    const before = todayTotal
    setError(null)
    setLogs((prev) => [temp, ...prev])
    setSplash({ key: Date.now(), ml: temp.effective_ml })
    if (before < goal && before + temp.effective_ml >= goal) {
      setCelebrate(true)
      setTimeout(() => setCelebrate(false), 2600)
    }
    try {
      const saved = await addLog(supabase, beverage, ml)
      setLogs((prev) => prev.map((x) => (x.id === temp.id ? saved : x)))
    } catch (e) {
      setLogs((prev) => prev.filter((x) => x.id !== temp.id))
      setError(`That drink wasn’t saved: ${errorMessage(e)}`)
    }
  }

  async function handleDelete(id: string) {
    const removed = logs.find((l) => l.id === id)
    setLogs((prev) => prev.filter((l) => l.id !== id))
    try {
      await deleteLog(supabase, id)
    } catch (e) {
      if (removed) setLogs((prev) => [...prev, removed].sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
      setError(`That drink wasn’t removed: ${errorMessage(e)}`)
    }
  }

  if (!profile || !loaded) {
    return error ? (
      <p role="alert" className="notice-error">{error}</p>
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
      {error && <p role="alert" className="notice-error mb-6">{error}</p>}

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
          <TodayLog logs={logs} onDelete={handleDelete} />
        </div>
      </div>
    </>
  )
}
