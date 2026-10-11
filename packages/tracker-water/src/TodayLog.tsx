'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { DELETE_BUTTON_CLASS } from '@rajs8952/ui'
import { ChevronDown, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { BEVERAGES } from '@rajs8952/core/hydration'
import type { DrinkLog } from '@rajs8952/core/types'
import { BeverageIcon } from './BeverageIcon'
import { DrinkEditor, type DrinkChange } from './DrinkEditor'

/** Long days collapse to the latest few entries so the page stays short. */
const COLLAPSED_COUNT = 4

export function TodayLog({
  logs,
  onDelete,
  onUpdate,
}: {
  logs: DrinkLog[]
  onDelete: (id: string) => void
  /** Resolves true once the change is stored; without it rows have no edit button. */
  onUpdate?: (id: string, change: DrinkChange) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  /** Closes the editor and puts focus back on the row's edit button, if the row is still here. */
  function closeEditor(id: string) {
    setEditingId(null)
    requestAnimationFrame(() => document.getElementById(`edit-drink-${id}`)?.focus())
  }
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
              const editing = editingId === l.id && onUpdate
              return (
                <motion.li
                  key={l.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  className={editing ? '' : 'flex items-center gap-3 px-4 py-3'}
                >
                  {editing ? (
                    <DrinkEditor
                      log={l}
                      onCancel={() => closeEditor(l.id)}
                      onSave={async (change) => {
                        const ok = await onUpdate(l.id, change)
                        if (ok) closeEditor(l.id)
                        return ok
                      }}
                    />
                  ) : (
                    <>
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
                      {onUpdate && (
                        <button
                          id={`edit-drink-${l.id}`}
                          type="button"
                          disabled={pending}
                          onClick={() => setEditingId(l.id)}
                          className={DELETE_BUTTON_CLASS}
                          aria-label={`Edit ${l.amount_ml} ml ${b.label.toLowerCase()}`}
                        >
                          <Pencil className="h-5 w-5" aria-hidden />
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onDelete(l.id)}
                        className={DELETE_BUTTON_CLASS}
                        aria-label={`Remove ${l.amount_ml} ml ${b.label.toLowerCase()}`}
                      >
                        <Trash2 className="h-5 w-5" aria-hidden />
                      </button>
                    </>
                  )}
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
