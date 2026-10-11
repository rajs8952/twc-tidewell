'use client'

import { Clock } from 'lucide-react'
import { useId } from 'react'
import { hhmm, whenFromIso, whenProblem, type WhenChoice } from '@rajs8952/core/when'

/**
 * "When did this happen?": Now, Earlier today or Yesterday (with a time).
 * When editing an entry from further back, its own date shows as a fourth
 * option. Shows a gentle note if the chosen time isn't allowed (later
 * today, or more than a week ago); the form should hold the save until it is.
 */
export function WhenPicker({ value, onChange, original, label = 'When' }: { value: WhenChoice; onChange: (v: WhenChoice) => void; original?: string; label?: string }) {
  const id = useId()
  const time = value.day === 'today' || value.day === 'yesterday' ? value.time : hhmm(new Date())
  const problem = whenProblem(value)
  const options: { key: WhenChoice['day']; label: string }[] = [
    { key: 'now', label: 'Now' },
    { key: 'today', label: 'Earlier today' },
    { key: 'yesterday', label: 'Yesterday' },
  ]
  // Entries from today or yesterday already show as those options; only older ones need their own date.
  const originalLabel = original && whenFromIso(original).day === 'original'
    ? new Date(original).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : null

  function pick(key: WhenChoice['day']) {
    if (key === 'now') onChange({ day: 'now' })
    else if (key === 'original' && original) onChange({ day: 'original', iso: original })
    else if (key === 'today' || key === 'yesterday') onChange({ day: key, time: key === 'today' && value.day !== 'today' ? hhmm(new Date(Date.now() - 3_600_000)) : time })
  }

  const chip = (on: boolean) =>
    `rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${on ? 'bg-ink text-white ring-ink' : 'bg-white text-ink ring-line hover:bg-mist'}`

  return (
    <fieldset>
      <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-bold">
        <Clock className="h-3.5 w-3.5 text-muted" aria-hidden /> {label}
      </legend>
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((o) => (
          <button key={o.key} type="button" aria-pressed={value.day === o.key} onClick={() => pick(o.key)} className={chip(value.day === o.key)}>
            {o.label}
          </button>
        ))}
        {originalLabel && (
          <button type="button" aria-pressed={value.day === 'original'} onClick={() => pick('original')} className={chip(value.day === 'original')}>
            {originalLabel}
          </button>
        )}
        {(value.day === 'today' || value.day === 'yesterday') && (
          <>
            <label htmlFor={`${id}-time`} className="sr-only">
              Time
            </label>
            <input
              id={`${id}-time`}
              type="time"
              value={value.time}
              onChange={(e) => e.target.value && onChange({ day: value.day as 'today' | 'yesterday', time: e.target.value })}
              className="rounded-xl border border-line bg-white px-2.5 py-1.5 text-sm font-semibold tabular-nums text-ink focus:outline-none focus:ring-4 focus:ring-tide-200/60"
            />
          </>
        )}
      </div>
      {problem && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-alert">
          {problem}
        </p>
      )}
    </fieldset>
  )
}

/** "Saved for yesterday, 9:30 pm" style note for entries that won't show in a today-only list. */
export function savedForNote(iso: string, now = new Date()) {
  const d = new Date(iso)
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  const day = sameDay ? 'today' : d.toDateString() === yesterday.toDateString() ? 'yesterday' : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })
  return `Saved for ${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.`
}
