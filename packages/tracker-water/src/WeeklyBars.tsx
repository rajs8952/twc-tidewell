'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { BEVERAGES, type BeverageId } from '@omniwell/core/hydration'

export interface BarDay {
  key: string
  label: string
  total: number
  segments: { id: BeverageId; ml: number }[]
  isToday: boolean
  isFuture: boolean
}

export function WeeklyBars({ days, goal }: { days: BarDay[]; goal: number }) {
  const reduce = useReducedMotion()
  const max = Math.max(goal * 1.2, ...days.map((d) => d.total), 1)
  const goalPct = (goal / max) * 100

  return (
    <figure>
      <div className="relative h-60">
        <div className="absolute inset-x-0 border-t-2 border-dashed border-sun-400" style={{ bottom: `${goalPct}%` }} aria-hidden>
          <span className="absolute -top-6 right-0 rounded-full bg-sun-100 px-2 py-0.5 text-xs font-bold text-sun-600">
            Goal {(goal / 1000).toFixed(2)} L
          </span>
        </div>
        <ol className="relative grid h-full grid-cols-7 items-end gap-2 sm:gap-4">
          {days.map((d, i) => {
            const h = (d.total / max) * 100
            const met = d.total >= goal
            return (
              <li key={d.key} className="flex h-full flex-col items-center justify-end">
                {d.total > 0 && (
                  <span className={`mb-1 text-[11px] font-bold tabular-nums ${met ? 'text-tide-700' : 'text-muted'}`}>
                    {(d.total / 1000).toFixed(1)}
                  </span>
                )}
                <motion.div
                  className={`flex w-full max-w-[44px] flex-col-reverse overflow-hidden rounded-xl ${d.total === 0 ? 'bg-line/60' : ''}`}
                  initial={{ height: 0 }}
                  animate={{ height: d.total === 0 ? 6 : `${h}%` }}
                  transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 18, delay: i * 0.05 }}
                  title={`${d.total.toLocaleString()} ml`}
                >
                  {d.segments.map((s) => (
                    <div key={s.id} style={{ flexGrow: s.ml, background: BEVERAGES[s.id].color }} />
                  ))}
                </motion.div>
              </li>
            )
          })}
        </ol>
      </div>
      <ol className="mt-2 grid grid-cols-7 gap-2 sm:gap-4" aria-hidden>
        {days.map((d) => (
          <li key={d.key} className={`text-center text-xs ${d.isToday ? 'font-extrabold text-ink' : 'font-semibold text-muted'}`}>
            {d.label}
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">
        {days.map((d) => `${d.label}: ${d.total} ml`).join('. ')}. Goal {goal} ml.
      </figcaption>
    </figure>
  )
}
