'use client'

import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { WhenPicker } from '@rajs8952/ui'
import { BEVERAGE_ORDER, BEVERAGES, type BeverageId } from '@rajs8952/core/hydration'
import type { DrinkLog } from '@rajs8952/core/types'
import { whenFromIso, whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'

export type DrinkChange = { beverage: BeverageId; amountMl: number; loggedAt?: string }

/** Inline editor for one drink: type, amount and when. onSave resolves true once it's stored. */
export function DrinkEditor({
  log,
  onSave,
  onCancel,
}: {
  log: DrinkLog
  onSave: (change: DrinkChange) => Promise<boolean>
  onCancel: () => void
}) {
  const id = useId()
  const [beverage, setBeverage] = useState<BeverageId>(log.beverage)
  const [amount, setAmount] = useState(String(log.amount_ml))
  const [initialWhen] = useState(() => whenFromIso(log.logged_at))
  const [when, setWhen] = useState<WhenChoice>(initialWhen)
  const [saving, setSaving] = useState(false)
  const firstField = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    firstField.current?.focus()
  }, [])

  const ml = Number(amount)
  const amountValid = Number.isFinite(ml) && ml >= 1 && ml <= 5000
  const problem = whenProblem(when)
  const canSave = amountValid && !problem && !saving

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canSave) return
    // Untouched time: keep the stored one (whenToIso would drop its seconds).
    // "Now" on an edit means the current moment, not "leave it".
    const loggedAt =
      JSON.stringify(when) === JSON.stringify(initialWhen) ? undefined : (whenToIso(when) ?? new Date().toISOString())
    setSaving(true)
    const ok = await onSave({ beverage, amountMl: Math.round(ml), loggedAt })
    if (!ok) setSaving(false)
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      aria-label={`Edit ${log.amount_ml} ml ${BEVERAGES[log.beverage].label.toLowerCase()}`}
      className="space-y-3 bg-mist/60 px-4 py-4"
    >
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor={`${id}-bev`} className="mb-1 block text-sm font-bold">
            Drink
          </label>
          <select
            id={`${id}-bev`}
            ref={firstField}
            value={beverage}
            onChange={(e) => setBeverage(e.target.value as BeverageId)}
            className="omni-input"
          >
            {BEVERAGE_ORDER.map((b) => (
              <option key={b} value={b}>
                {BEVERAGES[b].label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-32">
          <label htmlFor={`${id}-ml`} className="mb-1 block text-sm font-bold">
            Amount
          </label>
          <div className="relative">
            <input
              id={`${id}-ml`}
              inputMode="numeric"
              type="number"
              min={1}
              max={5000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!amountValid}
              className="omni-input pr-10"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">ml</span>
          </div>
        </div>
      </div>
      {!amountValid && <p className="text-xs font-semibold text-alert">Enter an amount from 1 to 5,000 ml.</p>}
      <WhenPicker value={when} onChange={setWhen} original={log.logged_at} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-bold text-muted transition hover:bg-white hover:text-ink">
          Cancel
        </button>
        <button type="submit" disabled={!canSave} className="omni-btn-primary px-4">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
