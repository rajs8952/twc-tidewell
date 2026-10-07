'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Droplet, Sparkles, Sprout } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { PlantArt } from './PlantArt'
import { useTrackerStorage } from '@omniwell/ui'
import { errorMessage } from '@omniwell/core/errors'
import { BUD_AT, GROW_TARGET, MOOD_LABEL, SPECIES, computeGarden, plantLine, type Mood } from '@omniwell/core/garden'
import { addDays, dayKey, parseDayKey, startOfDay } from '@omniwell/core/dates'
import { BEVERAGES, effectiveGoal } from '@omniwell/core/hydration'
import type { DrinkLog, Profile } from '@omniwell/core/types'

const WATER_AMOUNTS = [150, 250, 500]

const MOOD_STYLE: Record<Mood, string> = {
  thriving: 'bg-tide-100 text-tide-700',
  happy: 'bg-tide-50 text-tide-600',
  thirsty: 'bg-sun-100 text-sun-600',
  wilting: 'bg-alert/10 text-alert',
}

const shortDate = (key: string) => parseDayKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Water › Garden: a plant that grows as you hit your water goal. */
export function WaterGarden() {
  const storage = useTrackerStorage()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [logs, setLogs] = useState<DrinkLog[]>([])
  const [history, setHistory] = useState<Record<string, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [waterKey, setWaterKey] = useState(0)
  const [bloomed, setBloomed] = useState<string | null>(null)
  const grownCount = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const today = startOfDay(new Date())
        const [p, l, h] = await Promise.all([
          storage.profile.get(),
          storage.water.list(today, addDays(today, 1)),
          storage.water.dailyTotals(),
        ])
        if (!alive) return
        setProfile(p)
        setLogs(l)
        setHistory(h)
      } catch (e) {
        if (alive) setError(errorMessage(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [storage])

  const now = new Date()
  const todayKey = dayKey(now)
  const goal = profile ? effectiveGoal(profile) : 0
  const todayTotal = logs.reduce((s, l) => s + l.effective_ml, 0)
  const totals = useMemo(() => ({ ...history, [todayKey]: todayTotal }), [history, todayKey, todayTotal])
  const garden = useMemo(() => computeGarden(totals, goal), [totals, goal])

  // Celebrate when a watering pushes the current plant into bloom.
  useEffect(() => {
    if (!profile) return
    const n = garden.grown.length
    if (grownCount.current !== null && n > grownCount.current) {
      setBloomed(SPECIES[garden.grown[0].species].name)
      const t = setTimeout(() => setBloomed(null), 4000)
      grownCount.current = n
      return () => clearTimeout(t)
    }
    grownCount.current = n
  }, [garden.grown, profile])

  async function water(ml: number) {
    if (!profile) return
    const temp: DrinkLog = {
      id: `temp-${Date.now()}`,
      beverage: 'water',
      amount_ml: ml,
      multiplier: BEVERAGES.water.multiplier,
      effective_ml: ml,
      logged_at: new Date().toISOString(),
    }
    setError(null)
    setLogs((prev) => [temp, ...prev])
    setWaterKey(Date.now())
    try {
      const saved = await storage.water.add('water', ml)
      setLogs((prev) => prev.map((x) => (x.id === temp.id ? saved : x)))
    } catch (e) {
      setLogs((prev) => prev.filter((x) => x.id !== temp.id))
      setError(`That watering wasn’t saved: ${errorMessage(e)}`)
    }
  }

  if (!profile) {
    return error ? (
      <p role="alert" className="omni-notice-error">{error}</p>
    ) : (
      <div className="grid animate-pulse gap-8 md:grid-cols-2" aria-busy="true" aria-label="Loading">
        <div className="h-[520px] rounded-3xl bg-white/70" />
        <div className="h-64 rounded-3xl bg-white/70" />
      </div>
    )
  }

  const { current, grown, mood, droop, daysToBloom } = garden
  const species = SPECIES[current.species]
  const progress = goal ? Math.min(todayTotal / goal, 1) : 0
  const daysGrowing = Math.round((startOfDay(now).getTime() - parseDayKey(current.plantedOn).getTime()) / 86_400_000) + 1

  return (
    <>
      <header className="mb-6">
        <h2 className="text-2xl font-extrabold">Your garden</h2>
        <p className="mt-1 text-muted">Every drink waters your plant. Hit your goal to help it bloom.</p>
      </header>

      {error && <p role="alert" className="omni-notice-error mb-6">{error}</p>}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-8">
        <section
          aria-label={`${species.name} ${current.number}`}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-tide-100 via-tide-50 to-white p-5 ring-1 ring-line sm:p-7 md:sticky md:top-10 md:self-start"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted">
                Plant {current.number} · day {daysGrowing}
              </p>
              <h3 className="text-2xl font-extrabold">{species.name}</h3>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-bold ${MOOD_STYLE[mood]}`}>{MOOD_LABEL[mood]}</span>
          </div>

          <div className="relative mx-auto mt-4 max-w-[300px]">
            <AnimatePresence mode="wait">
              <motion.p
                key={mood}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="relative mx-auto w-fit max-w-[260px] rounded-2xl bg-white px-4 py-2.5 text-center text-sm font-semibold shadow-sm ring-1 ring-line after:absolute after:-bottom-1.5 after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-45 after:bg-white after:ring-0"
                aria-live="polite"
              >
                {plantLine(mood, now)}
              </motion.p>
            </AnimatePresence>
            <motion.div
              key={waterKey}
              initial={waterKey ? { scale: 0.97 } : false}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
            >
              <PlantArt
                species={current.species}
                fraction={current.fraction}
                droop={droop}
                mood={mood}
                waterKey={waterKey}
                className="mx-auto -mt-2 block h-auto w-full"
              />
            </motion.div>
          </div>

          <div className="mt-2">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-bold">{current.stage}</span>
              <span className="font-semibold text-muted">
                {current.fraction >= BUD_AT ? 'Bloom' : current.nextStage} next
              </span>
            </div>
            <div
              className="mt-2 h-3 overflow-hidden rounded-full bg-white ring-1 ring-line"
              role="progressbar"
              aria-label="Growth toward bloom"
              aria-valuemin={0}
              aria-valuemax={GROW_TARGET}
              aria-valuenow={Math.round(current.growth * 10) / 10}
            >
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#7CC36A] to-[#4F9B5B]"
                initial={false}
                animate={{ width: `${Math.max(current.fraction * 100, 2)}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 18 }}
              />
            </div>
            <p className="mt-2 text-sm text-muted">
              About {daysToBloom} more good {daysToBloom === 1 ? 'day' : 'days'} until it blooms.
            </p>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="water-heading">
            <h3 id="water-heading" className="text-lg font-bold">Drink and water</h3>
            <p className="mt-1 text-sm text-muted">Log a glass of water. Your plant drinks with you.</p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {WATER_AMOUNTS.map((ml) => (
                <motion.button
                  key={ml}
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => water(ml)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white py-3 transition hover:border-tide-400 hover:bg-tide-50"
                  aria-label={`Drink ${ml} ml of water and water your plant`}
                >
                  <Droplet className="h-5 w-5 fill-tide-400 text-tide-500" aria-hidden />
                  <span className="font-display text-base font-bold leading-none">{ml}</span>
                  <span className="text-xs text-muted">ml</span>
                </motion.button>
              ))}
            </div>
            <div className="mt-5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-bold">Today</span>
                <span className="font-semibold tabular-nums text-muted">
                  {todayTotal.toLocaleString()} of {goal.toLocaleString()} ml
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-mist">
                <motion.div
                  className="h-full rounded-full bg-tide-500"
                  initial={false}
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                />
              </div>
            </div>
          </section>

          <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="shelf-heading">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="shelf-heading" className="text-lg font-bold">Bloomed plants</h3>
              <span className="text-sm font-semibold text-muted">{grown.length}</span>
            </div>
            {grown.length === 0 ? (
              <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-5 text-sm text-muted">
                <Sprout className="h-6 w-6 shrink-0 text-[#4F9B5B]" aria-hidden />
                Your first bloom will appear here. Fully grown plants stay in your garden for good.
              </div>
            ) : (
              <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {grown.map((g, i) => (
                  <li key={`${g.bloomedOn}-${i}`} className="flex flex-col items-center rounded-2xl bg-mist/60 px-1 pb-2 pt-1 text-center">
                    <PlantArt species={g.species} fraction={1} mini className="h-20 w-auto" />
                    <span className="text-xs font-bold">{SPECIES[g.species].name}</span>
                    <span className="text-[11px] text-muted">{shortDate(g.bloomedOn)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl bg-white p-5 text-sm ring-1 ring-line sm:p-6" aria-labelledby="how-heading">
            <h3 id="how-heading" className="text-lg font-bold">How your plant grows</h3>
            <ul className="mt-3 space-y-2 text-muted">
              <li>Each day adds growth equal to the share of your goal you drank, up to one full day.</li>
              <li>{GROW_TARGET} full days grow a seed into a bloom, then a new seed is planted.</li>
              <li>Fall behind and it droops. It never dies, and perks up as soon as you drink.</li>
            </ul>
          </section>
        </div>
      </div>

      <AnimatePresence>
        {bloomed && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed inset-x-4 bottom-28 z-50 mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-white shadow-lg md:bottom-8"
          >
            <Sparkles className="h-5 w-5 shrink-0 text-sun-400" aria-hidden />
            <span className="text-sm font-semibold">Your {bloomed} bloomed! It’s now in your garden, and a new seed is planted.</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
