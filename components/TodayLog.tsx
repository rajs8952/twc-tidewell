'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { BEVERAGES } from '@/lib/hydration'
import type { DrinkLog } from '@/lib/types'
import { BeverageIcon } from './BeverageIcon'

export function TodayLog({ logs, onDelete }: { logs: DrinkLog[]; onDelete: (id: string) => void }) {
  return (
    <section aria-labelledby="today-heading">
      <h2 id="today-heading" className="text-lg font-bold">Today’s drinks</h2>
      {logs.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nothing logged yet. Tap a size above to add your first drink.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <AnimatePresence initial={false}>
            {logs.map((l) => {
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
        </ul>
      )}
    </section>
  )
}
