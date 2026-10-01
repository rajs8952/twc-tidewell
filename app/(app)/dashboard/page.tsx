'use client'

import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { DrinkLogger } from '@/components/DrinkLogger'
import { StreakCard, type WeekDay } from '@/components/StreakCard'
import { TodayLog } from '@/components/TodayLog'
import { WaterVessel } from '@/components/WaterVessel'
import { flushPendingAvatar } from '@/lib/avatar'
import { addLog, deleteLog, getDailyTotals, getLogsBetween, getProfile } from '@/lib/data'
import { errorMessage } from '@/lib/errors'
import {
  BEVERAGES,
  addDays,
  computeStreaks,
  dayKey,
  effectiveGoal,
  greeting,
  motivationalMessage,
  startOfDay,
  startOfWeek,
  type BeverageId,
} from '@/lib/hydration'
import { createClient } from '@/lib/supabase/client'
import type { DrinkLog, Profile } from '@/lib/types'

export default function DashboardPage() {
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [logs, setLogs] = useState<DrinkLog[]>([])
  const [history, setHistory] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [splash, setSplash] = useState<{ key: number; ml: number } | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const today = startOfDay(new Date())
        const [p, l, h] = await Promise.all([
          getProfile(supabase),
          getLogsBetween(supabase, today, addDays(today, 1)),
          getDailyTotals(supabase),
        ])
        if (!alive) return
        setProfile(p)
        setLogs(l)
        setHistory(h)
        const url = await flushPendingAvatar(supabase, p.id)
        if (url && alive) setProfile({ ...p, avatar_url: url })
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

  if (!profile) {
    return error ? (
      <p role="alert" className="notice-error">{error}</p>
    ) : (
      <div className="grid animate-pulse gap-8 md:grid-cols-2" aria-busy="true" aria-label="Loading">
        <div className="mx-auto h-[380px] w-[240px] rounded-[48px] bg-white/70" />
        <div className="space-y-4">
          <div className="h-40 rounded-3xl bg-white/70" />
          <div className="h-64 rounded-3xl bg-white/70" />
        </div>
      </div>
    )
  }

  const firstName = profile.full_name.split(' ')[0]

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4 sm:mb-10">
        <div>
          <p className="text-sm font-semibold text-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <Link href="/profile" aria-label="Edit profile" className="rounded-full">
          <Avatar src={profile.avatar_url} name={profile.full_name} size={48} />
        </Link>
      </header>

      {error && <p role="alert" className="notice-error mb-6">{error}</p>}

      <div className="grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12">
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
          <div className="mt-6 max-w-xs text-center" aria-live="polite">
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
