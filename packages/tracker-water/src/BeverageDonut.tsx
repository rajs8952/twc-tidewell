'use client'

import { motion } from 'framer-motion'
import { BEVERAGES, type BeverageId } from '@omniwell/core/hydration'
import { BeverageIcon } from './BeverageIcon'

export interface BevShare {
  id: BeverageId
  effective: number
  volume: number
}

export function BeverageDonut({ shares }: { shares: BevShare[] }) {
  const total = shares.reduce((s, x) => s + x.effective, 0)
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0

  if (total === 0) {
    return <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">No drinks logged this week.</p>
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90" role="img" aria-label="Beverage breakdown">
        <circle cx="70" cy="70" r={R} fill="none" stroke="#EDF4F3" strokeWidth="18" />
        {shares.map((s) => {
          const len = (s.effective / total) * C
          const el = (
            <motion.circle
              key={s.id}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={BEVERAGES[s.id].color}
              strokeWidth="18"
              strokeDashoffset={-offset}
              initial={{ strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${Math.max(len - 1.5, 0.5)} ${C}` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          )
          offset += len
          return el
        })}
      </svg>
      <ul className="w-full space-y-2.5">
        {shares.map((s) => {
          const b = BEVERAGES[s.id]
          return (
            <li key={s.id} className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ background: b.color }}>
                <BeverageIcon id={s.id} className="h-4 w-4" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">{b.label}</span>
                <span className="block text-xs text-muted">
                  {s.volume.toLocaleString()} ml drunk
                  {b.multiplier !== 1 && `, ${s.effective.toLocaleString()} ml counted`}
                </span>
              </span>
              <span className="font-display text-sm font-bold tabular-nums">{Math.round((s.effective / total) * 100)}%</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
