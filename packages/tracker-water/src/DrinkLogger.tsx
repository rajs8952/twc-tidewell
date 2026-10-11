'use client'

import { motion } from 'framer-motion'
import { Clock, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { WhenPicker } from '@rajs8952/ui'
import { BEVERAGE_ORDER, BEVERAGES, PRESETS, type BeverageId } from '@rajs8952/core/hydration'
import { hhmm, whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
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

/** "yesterday, 9:30 pm" for the backdating notice. */
function whenLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${d.toDateString() === now.toDateString() ? 'today' : 'yesterday'}, ${time}`
}

export function DrinkLogger({ onAdd }: { onAdd: (beverage: BeverageId, ml: number, loggedAt?: string) => void }) {
  const [beverage, setBeverage] = useState<BeverageId>('water')
  const [custom, setCustom] = useState('')
  // Backdating stays tucked away so the usual "tap a size" flow is untouched.
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const b = BEVERAGES[beverage]
  const customMl = Number(custom)
  const customValid = Number.isFinite(customMl) && customMl >= 10 && customMl <= 5000
  const backdated = when.day !== 'now'
  const blocked = whenProblem(when) !== null
  const loggedAt = whenToIso(when)
  const forLabel = loggedAt ? ` for ${whenLabel(loggedAt)}` : ''

  function startEarlier() {
    const d = new Date(Date.now() - 3_600_000)
    setWhen({ day: d.toDateString() === new Date().toDateString() ? 'today' : 'yesterday', time: hhmm(d) })
  }

  /** Recomputed at tap time so "Earlier today, 14:00" is still that moment if the page sat open. */
  const add = (ml: number) => {
    if (blocked) return
    onAdd(beverage, ml, whenToIso(when))
  }

  // Fade the chip row's right edge while more chips are hidden off-screen.
  const chipsRef = useRef<HTMLDivElement>(null)
  const [moreChips, setMoreChips] = useState(false)
  useEffect(() => {
    const el = chipsRef.current
    if (!el) return
    const update = () => setMoreChips(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <section className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6" aria-labelledby="log-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="log-heading" className="text-lg font-bold">Log a drink</h2>
        {!backdated && (
          <button type="button" onClick={startEarlier} className="text-sm font-semibold text-muted underline-offset-2 transition hover:text-ink hover:underline">
            Logged earlier?
          </button>
        )}
      </div>

      <div className="relative mt-4">
      <div
        ref={chipsRef}
        role="radiogroup"
        aria-label="Beverage"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
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
        <div
          className={`pointer-events-none absolute inset-y-0 -right-1 w-10 bg-gradient-to-l from-white transition-opacity ${
            moreChips ? 'opacity-100' : 'opacity-0'
          }`}
          aria-hidden
        />
      </div>

      <p className="mt-3 text-sm text-muted">
        {b.multiplier === 1
          ? `${b.label} counts fully toward your goal.`
          : `${b.label} counts as ${Math.round(b.multiplier * 100)}% of its volume.`}
      </p>

      {backdated && (
        <div className="mt-4 space-y-3 rounded-2xl bg-mist p-3">
          <WhenPicker value={when} onChange={setWhen} label="When did you drink it?" />
          {loggedAt && !blocked && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1 text-white">
                <Clock className="h-3.5 w-3.5" aria-hidden /> Taps log for {whenLabel(loggedAt)}
              </span>
              <button type="button" onClick={() => setWhen({ day: 'now' })} className="font-bold text-tide-600 underline-offset-2 hover:underline">
                Back to now
              </button>
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-5 gap-1.5 sm:gap-2">
        {PRESETS.map((p) => (
          <motion.button
            key={p.ml}
            type="button"
            whileTap={{ scale: 0.94 }}
            disabled={blocked}
            onClick={() => add(p.ml)}
            className="flex flex-col items-center gap-1 rounded-xl border border-line bg-white px-1 py-3 transition hover:border-tide-400 hover:bg-tide-50 disabled:opacity-40 sm:px-2"
            aria-label={`Add ${p.ml} ml ${b.label.toLowerCase()} (${p.label.toLowerCase()})${forLabel}`}
          >
            <MiniGlass ml={p.ml} color={b.color} />
            <span className="font-display text-base font-bold leading-none">{p.ml}</span>
            <span className="text-center text-[11px] leading-tight text-muted sm:text-xs">{p.label}</span>
          </motion.button>
        ))}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!customValid || blocked) return
          add(Math.round(customMl))
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
            className="omni-input pr-12"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">ml</span>
        </div>
        <button type="submit" disabled={!customValid || blocked} className="omni-btn-primary px-4">
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </form>
    </section>
  )
}
