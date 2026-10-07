'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ProfileStore, WaterStore } from '@rajs8952/core/storage'
import { useStore } from '@rajs8952/ui'
import { BeverageDonut, type BevShare } from './BeverageDonut'
import { WeeklyBars, type BarDay } from './WeeklyBars'
import { errorMessage } from '@rajs8952/core/errors'
import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
import { BEVERAGE_ORDER, BEVERAGES, effectiveGoal } from '@rajs8952/core/hydration'
import type { DrinkLog, Profile } from '@rajs8952/core/types'

function weekTitle(offset: number, start: Date) {
  if (offset === 0) return 'This week'
  if (offset === -1) return 'Last week'
  const end = addDays(start, 6)
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${fmt(start)} to ${fmt(end)}`
}

/** Water › Stats: the week's hydration, per day and per drink. */
export function WaterStats({ adapter, profileAdapter }: { adapter?: WaterStore; profileAdapter?: ProfileStore } = {}) {
  const water = useStore('water', adapter)
  const profiles = useStore('profile', profileAdapter)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [offset, setOffset] = useState(0)
  const [logs, setLogs] = useState<DrinkLog[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const now = new Date()
  const weekStart = addDays(startOfWeek(now), offset * 7)
  const weekStartKey = dayKey(weekStart)

  useEffect(() => {
    profiles.get().then(setProfile).catch((e) => setError(errorMessage(e)))
  }, [water, profiles])

  useEffect(() => {
    let alive = true
    setLogs(null)
    const start = addDays(startOfWeek(new Date()), offset * 7)
    water.list(start, addDays(start, 7))
      .then((l) => alive && setLogs(l))
      .catch((e) => alive && setError(errorMessage(e)))
    return () => {
      alive = false
    }
  }, [water, offset])

  const goal = profile ? effectiveGoal(profile) : 0
  const todayKey = dayKey(now)

  const days: BarDay[] = useMemo(() => {
    const start = addDays(startOfWeek(new Date()), offset * 7)
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i)
      const k = dayKey(d)
      const dayLogs = (logs ?? []).filter((l) => dayKey(new Date(l.logged_at)) === k)
      const segments = BEVERAGE_ORDER.map((id) => ({
        id,
        ml: dayLogs.filter((l) => l.beverage === id).reduce((s, l) => s + l.effective_ml, 0),
      })).filter((s) => s.ml > 0)
      return {
        key: k,
        label: d.toLocaleDateString(undefined, { weekday: 'short' }),
        total: segments.reduce((s, x) => s + x.ml, 0),
        segments,
        isToday: k === todayKey,
        isFuture: d > new Date(),
      }
    })
  }, [logs, offset, todayKey])

  const shares: BevShare[] = BEVERAGE_ORDER.map((id) => {
    const of = (logs ?? []).filter((l) => l.beverage === id)
    return { id, effective: of.reduce((s, l) => s + l.effective_ml, 0), volume: of.reduce((s, l) => s + l.amount_ml, 0) }
  })
    .filter((s) => s.volume > 0)
    .sort((a, b) => b.effective - a.effective)

  const elapsed = days.filter((d) => !d.isFuture).length || 1
  const weekTotal = days.reduce((s, d) => s + d.total, 0)
  const avg = Math.round(weekTotal / elapsed)
  const goalDays = days.filter((d) => goal && d.total >= goal).length
  const bestDay = days.reduce((a, b) => (b.total > a.total ? b : a), days[0])

  const stats = [
    { label: 'Daily average', value: `${(avg / 1000).toFixed(2)} L` },
    { label: 'Goal reached', value: `${goalDays} of ${elapsed} ${elapsed === 1 ? 'day' : 'days'}` },
    { label: 'Week total', value: `${(weekTotal / 1000).toFixed(1)} L` },
    { label: 'Best day', value: bestDay.total ? `${bestDay.label}, ${(bestDay.total / 1000).toFixed(1)} L` : 'None yet' },
  ]

  return (
    <>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold">Your hydration</h2>
          <p className="mt-1 text-muted">Counted amounts, after each drink’s hydration share is applied.</p>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-white p-1 ring-1 ring-line">
          <button type="button" onClick={() => setOffset((o) => o - 1)} className="rounded-full p-2 hover:bg-mist" aria-label="Previous week">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[8.5rem] text-center text-sm font-bold" aria-live="polite">{weekTitle(offset, weekStart)}</span>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(o + 1, 0))}
            disabled={offset === 0}
            className="rounded-full p-2 hover:bg-mist disabled:opacity-30"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      {error && <p role="alert" className="omni-notice-error mb-6">{error}</p>}

      <dl className="mb-8 grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-0.5 font-display text-xl font-bold sm:text-2xl">{logs ? s.value : '…'}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-7" aria-labelledby="week-heading">
          <h3 id="week-heading" className="mb-8 text-lg font-bold">Daily totals</h3>
          {logs && goal ? (
            <WeeklyBars key={weekStartKey} days={days} goal={goal} />
          ) : (
            <div className="h-64 animate-pulse rounded-2xl bg-mist" aria-busy="true" />
          )}
          {shares.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 text-xs font-semibold text-muted">
              {shares.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: BEVERAGES[s.id].color }} aria-hidden />
                  {BEVERAGES[s.id].label}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-7" aria-labelledby="mix-heading">
          <h3 id="mix-heading" className="mb-6 text-lg font-bold">What you drank</h3>
          {logs ? <BeverageDonut key={weekStartKey} shares={shares} /> : <div className="h-40 animate-pulse rounded-2xl bg-mist" />}
        </section>
      </div>
    </>
  )
}
