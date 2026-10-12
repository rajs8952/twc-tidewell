'use client'

import { ArrowDown, ArrowUp, CalendarRange, Minus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { storageKey } from '@/lib/brand'
import { parseDayKey } from '@rajs8952/core/dates'
import type { Recap } from '@/lib/recap'

const DISMISS_KEY = storageKey('recap-dismissed')

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m` : `${Math.round(m)} min`)
const MOOD_WORD = ['', 'Awful', 'Bad', 'Okay', 'Good', 'Great']
const moodWord = (avg: number) => MOOD_WORD[Math.min(5, Math.max(1, Math.round(avg)))]

/** ↑ / ↓ / = against the week before, in words for screen readers (never colour alone). */
function Trend({ now, before, unit = '' }: { now: number | null; before: number | null; unit?: string }) {
  if (now == null || before == null) return null
  const d = now - before
  if (Math.abs(d) < 1e-9) return <span className="inline-flex items-center gap-0.5 text-xs text-muted"><Minus className="h-3 w-3" aria-hidden />same as the week before</span>
  const Icon = d > 0 ? ArrowUp : ArrowDown
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted">
      <Icon className="h-3 w-3" aria-hidden />
      {d > 0 ? 'up' : 'down'} {unit ? `${Math.abs(Math.round(d))}${unit}` : ''} on the week before
    </span>
  )
}

/**
 * "Your week": last week next to the week before, at the top of Home from
 * Monday to Wednesday (and whenever someone arrives from the Monday
 * notification at /dashboard#week). Dismissing hides it until next week.
 */
export function WeeklyRecap({ recap }: { recap: Recap }) {
  const [hidden, setHidden] = useState(true)

  useEffect(() => {
    const weekday = new Date().getDay() // 0 Sunday … 6 Saturday
    const early = weekday >= 1 && weekday <= 3
    let dismissed = false
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === recap.weekOf
    } catch {
      /* per-device convenience only */
    }
    setHidden(!recap.hasData || dismissed || !(early || window.location.hash === '#week'))
  }, [recap])

  if (hidden) return null
  const { last, prev, goals } = recap
  const weekLabel = parseDayKey(recap.weekOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

  const stats = [
    last.waterGoalDays + prev.waterGoalDays > 0 && { label: 'Water goal', value: `${last.waterGoalDays} of 7 days`, trend: <Trend now={last.waterGoalDays} before={prev.waterGoalDays} /> },
    last.sleepAvgMin != null && { label: 'Sleep', value: `${fmtMin(last.sleepAvgMin)} a night`, trend: <Trend now={last.sleepAvgMin} before={prev.sleepAvgMin} unit=" min" /> },
    last.moodAvg != null && { label: 'Mood', value: `Mostly ${moodWord(last.moodAvg).toLowerCase()}`, trend: <Trend now={last.moodAvg} before={prev.moodAvg} /> },
    last.exerciseMin + prev.exerciseMin > 0 && { label: 'Exercise', value: `${last.exerciseMin} of ${goals.exerciseWeekMin} min`, trend: <Trend now={last.exerciseMin} before={prev.exerciseMin} unit=" min" /> },
    last.meditationMin + prev.meditationMin > 0 && { label: 'Meditation', value: `${last.meditationMin} min`, trend: <Trend now={last.meditationMin} before={prev.meditationMin} unit=" min" /> },
    last.weightKg != null && {
      label: 'Weight',
      value: `${last.weightKg.toFixed(1)} kg`,
      trend: prev.weightKg != null ? <span className="text-xs text-muted">{(last.weightKg - prev.weightKg >= 0 ? '+' : '−') + Math.abs(last.weightKg - prev.weightKg).toFixed(1)} kg on the week before</span> : null,
    },
  ].filter(Boolean) as { label: string; value: string; trend: React.ReactNode }[]

  function dismiss() {
    setHidden(true)
    try {
      localStorage.setItem(DISMISS_KEY, recap.weekOf)
    } catch {
      /* per-device convenience only */
    }
  }

  return (
    <section id="week" aria-labelledby="week-title" className="mb-6 scroll-mt-6 rounded-3xl bg-gradient-to-br from-[#EEF2FF] to-white p-5 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#4A5BC4] text-white">
            <CalendarRange className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#3A49A8]">Your week · from {weekLabel}</p>
            <h2 id="week-title" className="font-display text-lg font-extrabold leading-snug">
              {recap.headline}
            </h2>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="-mr-1 rounded-full p-2 text-muted hover:bg-white hover:text-ink" aria-label="Hide this week’s recap">
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-white/80 p-3 ring-1 ring-line">
            <dt className="text-xs font-semibold text-muted">{s.label}</dt>
            <dd className="mt-0.5 font-bold">{s.value}</dd>
            <dd className="mt-0.5">{s.trend}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
