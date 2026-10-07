'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BEVERAGES } from '@rajs8952/core/hydration'
import type { DrinkLog } from '@rajs8952/core/types'
import { BeverageIcon } from './BeverageIcon'

/** Long days collapse to the latest few entries so the page stays short. */
const COLLAPSED_COUNT = 4

export function TodayLog({ logs, onDelete }: { logs: DrinkLog[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = Math.max(logs.length - COLLAPSED_COUNT, 0)
  const visible = expanded ? logs : logs.slice(0, COLLAPSED_COUNT)
  const total = logs.reduce((sum, l) => sum + l.effective_ml, 0)

  return (
    <section aria-labelledby="today-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-heading" className="text-lg font-bold">Today’s drinks</h2>
        {logs.length > 0 && (
          <p className="text-sm font-semibold tabular-nums text-muted">
            {logs.length} {logs.length === 1 ? 'drink' : 'drinks'} · {total.toLocaleString()} ml
          </p>
        )}
      </div>
      {logs.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nothing logged yet. Tap a size above to add your first drink.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <AnimatePresence initial={false}>
            {visible.map((l) => {
              const b = BEVERAGES[l.beverage]
              const pending = l.id.startsWith('temp-')
              return (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                    style={{ background: b.color }}
                  >
                    <BeverageIcon id={l.beverage} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {l.amount_ml} ml {b.label.toLowerCase()}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(l.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {l.multiplier !== 1 && `, counts as ${l.effective_ml} ml`}
                      {pending && ', saving…'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onDelete(l.id)}
                    className="rounded-full p-2 text-muted transition hover:bg-mist hover:text-alert disabled:opacity-30"
                    aria-label={`Remove ${l.amount_ml} ml ${b.label.toLowerCase()}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </motion.li>
              )
            })}
          </AnimatePresence>
          {hidden > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-center gap-1.5 px-4 py-3 text-sm font-bold text-tide-600 transition hover:bg-tide-50"
              >
                {expanded ? 'Show less' : `Show ${hidden} earlier ${hidden === 1 ? 'drink' : 'drinks'}`}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden />
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  )
}
