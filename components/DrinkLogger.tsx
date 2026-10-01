'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { BEVERAGE_ORDER, BEVERAGES, PRESETS, type BeverageId } from '@/lib/hydration'
import { BeverageIcon } from './BeverageIcon'

function MiniGlass({ ml, color }: { ml: number; color: string }) {
  const level = Math.max(0.18, Math.min(ml / 750, 1))
  const h = 26
  return (
    <svg viewBox="0 0 20 30" className="h-8 w-6" aria-hidden>
      <defs>
        <clipPath id={`g-${ml}`}>
          <path d="M3 2h14l-1.6 25a2 2 0 0 1-2 1.9H6.6a2 2 0 0 1-2-1.9L3 2Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#g-${ml})`}>
        <rect x="0" y={2 + h * (1 - level)} width="20" height={h * level + 2} fill={color} />
      </g>
      <path d="M3 2h14l-1.6 25a2 2 0 0 1-2 1.9H6.6a2 2 0 0 1-2-1.9L3 2Z" fill="none" stroke="#0F2F37" strokeOpacity=".35" strokeWidth="1.4" />
    </svg>
  )
}

export function DrinkLogger({ onAdd }: { onAdd: (beverage: BeverageId, ml: number) => void }) {
  const [beverage, setBeverage] = useState<BeverageId>('water')
  const [custom, setCustom] = useState('')
  const b = BEVERAGES[beverage]
  const customMl = Number(custom)
  const customValid = Number.isFinite(customMl) && customMl >= 10 && customMl <= 5000

  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="log-heading">
      <h2 id="log-heading" className="text-lg font-bold">Log a drink</h2>

      <div role="radiogroup" aria-label="Beverage" className="-mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {BEVERAGE_ORDER.map((id) => {
          const active = id === beverage
          const item = BEVERAGES[id]
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setBeverage(id)}
              className={`relative flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-bold transition ${
                active ? 'text-white' : 'bg-mist text-ink hover:bg-tide-50'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="bev-pill"
                  className="absolute inset-0 -z-0 rounded-full"
                  style={{ background: item.color }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                />
              )}
              <BeverageIcon id={id} className="relative h-4 w-4" />
              <span className="relative">{item.label}</span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-sm text-muted">
        {b.multiplier === 1
          ? `${b.label} counts fully toward your goal.`
          : `${b.label} counts as ${Math.round(b.multiplier * 100)}% of its volume.`}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {PRESETS.map((p) => (
          <motion.button
            key={p.ml}
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => onAdd(beverage, p.ml)}
            className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-white px-2 py-3 transition hover:border-tide-400 hover:bg-tide-50"
            aria-label={`Add ${p.ml} ml ${b.label.toLowerCase()} (${p.label.toLowerCase()})`}
          >
            <MiniGlass ml={p.ml} color={b.color} />
            <span className="font-display text-base font-bold leading-none">{p.ml}</span>
            <span className="text-xs text-muted">{p.label}</span>
          </motion.button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!customValid) return
          onAdd(beverage, Math.round(customMl))
          setCustom('')
        }}
      >
        <label htmlFor="custom-ml" className="sr-only">Custom amount in millilitres</label>
        <div className="relative flex-1">
          <input
            id="custom-ml"
            inputMode="numeric"
            type="number"
            min={10}
            max={5000}
            placeholder="Other amount"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="input pr-12"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">ml</span>
        </div>
        <button type="submit" disabled={!customValid} className="btn-primary px-4">
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </form>
    </section>
  )
}
