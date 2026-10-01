'use client'

import { motion } from 'framer-motion'
import { Check, Flame } from 'lucide-react'

export interface WeekDay {
  key: string
  label: string
  progress: number
  isToday: boolean
  isFuture: boolean
}

export function StreakCard({ current, best, week }: { current: number; best: number; week: WeekDay[] }) {
  const R = 15
  const C = 2 * Math.PI * R
  return (
    <section className="rounded-3xl bg-sun-100 p-5 sm:p-6" aria-label="Streak">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <motion.span
            key={current}
            initial={{ scale: 0.6, rotate: -12 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 14 }}
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sun-400 text-white"
          >
            <Flame className="h-6 w-6" aria-hidden />
          </motion.span>
          <div>
            <p className="font-display text-2xl font-extrabold leading-none text-ink">
              {current} {current === 1 ? 'day' : 'days'}
            </p>
            <p className="mt-1 text-sm text-muted">{current > 0 ? 'Current streak' : 'Hit today’s goal to start a streak'}</p>
          </div>
        </div>
        <p className="text-right text-sm text-muted">
          Best
          <span className="block font-display text-lg font-bold text-sun-600">{best}</span>
        </p>
      </div>

      <ol className="mt-5 grid grid-cols-7 gap-1">
        {week.map((d) => {
          const met = d.progress >= 1
          return (
            <li key={d.key} className="flex flex-col items-center gap-1.5">
              <span className="relative h-9 w-9">
                <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                  <circle cx="18" cy="18" r={R} fill={met ? '#F2AE2E' : '#fff'} stroke="#F4DDA8" strokeWidth="3" />
                  {!met && !d.isFuture && d.progress > 0 && (
                    <circle
                      cx="18"
                      cy="18"
                      r={R}
                      fill="none"
                      stroke="#F2AE2E"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={`${C * d.progress} ${C}`}
                    />
                  )}
                </svg>
                {met && <Check className="absolute inset-0 m-auto h-4 w-4 text-white" strokeWidth={3} aria-hidden />}
              </span>
              <span className={`text-xs ${d.isToday ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>
                {d.label}
              </span>
              <span className="sr-only">
                {d.isFuture ? 'upcoming' : met ? 'goal met' : `${Math.round(d.progress * 100)}% of goal`}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
