'use client'

import { motion } from 'framer-motion'
import { useState } from 'react'
import { HEIGHT_CM, cmToFeetInches, feetInchesToCm } from '@rajs8952/core/biometrics'
import { ACTIVITY_LEVELS, GENDERS, goalBreakdown, type Activity, type Gender } from '@rajs8952/core/hydration'

const LB_PER_KG = 2.20462
const round1 = (n: number) => Math.round(n * 10) / 10

export function WeightInput({ kg, onChange, id = 'weight' }: { kg: number; onChange: (kg: number) => void; id?: string }) {
  const [unit, setUnit] = useState<'kg' | 'lb'>('kg')
  const [text, setText] = useState(kg ? String(round1(kg)) : '')

  function switchUnit(u: 'kg' | 'lb') {
    if (u === unit) return
    setUnit(u)
    if (kg) setText(String(round1(u === 'kg' ? kg : kg * LB_PER_KG)))
  }

  return (
    <div>
      <label htmlFor={id} className="omni-label">Body weight</label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step="0.1"
          min={unit === 'kg' ? 25 : 55}
          max={unit === 'kg' ? 300 : 660}
          required
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) onChange(round1(unit === 'kg' ? n : n / LB_PER_KG))
          }}
          className="omni-input"
        />
        <div className="flex rounded-2xl bg-mist p-1" role="radiogroup" aria-label="Weight unit">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => switchUnit(u)}
              className={`rounded-xl px-3.5 text-sm font-bold transition ${unit === u ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Height in cm or feet + inches; always reports centimetres (or null when cleared). */
export function HeightInput({ cm, onChange, id = 'height' }: { cm: number | null; onChange: (cm: number | null) => void; id?: string }) {
  const [unit, setUnit] = useState<'cm' | 'ft'>('cm')
  const [cmText, setCmText] = useState(cm ? String(round1(cm)) : '')
  const initial = cm ? cmToFeetInches(cm) : null
  const [ftText, setFtText] = useState(initial ? String(initial.ft) : '')
  const [inText, setInText] = useState(initial ? String(initial.in) : '')

  function switchUnit(u: 'cm' | 'ft') {
    if (u === unit) return
    setUnit(u)
    if (!cm) return
    const fi = cmToFeetInches(cm)
    setCmText(String(round1(cm)))
    setFtText(String(fi.ft))
    setInText(String(fi.in))
  }

  function updateFeet(ft: string, inches: string) {
    setFtText(ft)
    setInText(inches)
    const f = parseFloat(ft)
    const i = inches === '' ? 0 : parseFloat(inches)
    onChange(Number.isFinite(f) && Number.isFinite(i) ? feetInchesToCm(f, i) : null)
  }

  return (
    <div>
      <label htmlFor={id} className="omni-label">Height</label>
      <div className="flex gap-2">
        {unit === 'cm' ? (
          <div className="relative flex-1">
            <input
              id={id}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={HEIGHT_CM.min}
              max={HEIGHT_CM.max}
              placeholder="170"
              value={cmText}
              onChange={(e) => {
                setCmText(e.target.value)
                const n = parseFloat(e.target.value)
                onChange(Number.isFinite(n) ? round1(n) : null)
              }}
              className="omni-input pr-12"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">cm</span>
          </div>
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-2">
            <div className="relative">
              <input
                id={id}
                type="number"
                inputMode="numeric"
                min={3}
                max={8}
                placeholder="5"
                aria-label="Height, feet"
                value={ftText}
                onChange={(e) => updateFeet(e.target.value, inText)}
                className="omni-input pr-9"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">ft</span>
            </div>
            <div className="relative">
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={11}
                placeholder="7"
                aria-label="Height, inches"
                value={inText}
                onChange={(e) => updateFeet(ftText, e.target.value)}
                className="omni-input pr-9"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">in</span>
            </div>
          </div>
        )}
        <div className="flex rounded-2xl bg-mist p-1" role="radiogroup" aria-label="Height unit">
          {(['cm', 'ft'] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => switchUnit(u)}
              className={`rounded-xl px-3.5 text-sm font-bold transition ${unit === u ? 'bg-white text-ink shadow-sm' : 'text-muted'}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GenderPicker({ value, onChange }: { value: Gender; onChange: (g: Gender) => void }) {
  return (
    <fieldset>
      <legend className="omni-label">Sex</legend>
      <div className="grid grid-cols-3 gap-2">
        {GENDERS.map((g) => (
          <label
            key={g.id}
            className={`cursor-pointer rounded-2xl border px-2 py-3 text-center text-sm font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide-500 ${
              value === g.id ? 'border-tide-500 bg-tide-50 text-tide-700' : 'border-line bg-white text-ink hover:border-tide-300'
            }`}
          >
            <input type="radio" name="gender" value={g.id} checked={value === g.id} onChange={() => onChange(g.id)} className="sr-only" />
            {g.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function ActivityPicker({ value, onChange }: { value: Activity; onChange: (a: Activity) => void }) {
  return (
    <fieldset>
      <legend className="omni-label">Daily activity</legend>
      <div className="space-y-2">
        {ACTIVITY_LEVELS.map((a, i) => {
          const active = value === a.id
          return (
            <label
              key={a.id}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide-500 ${
                active ? 'border-tide-500 bg-tide-50' : 'border-line bg-white hover:border-tide-300'
              }`}
            >
              <input type="radio" name="activity" value={a.id} checked={active} onChange={() => onChange(a.id)} className="sr-only" />
              <span className="flex h-6 items-end gap-0.5" aria-hidden>
                {ACTIVITY_LEVELS.map((_, j) => (
                  <span
                    key={j}
                    className={`w-1 rounded-full ${j <= i ? (active ? 'bg-tide-500' : 'bg-ink/40') : 'bg-line'}`}
                    style={{ height: 6 + j * 4 }}
                  />
                ))}
              </span>
              <span className="flex-1">
                <span className="block text-sm font-bold">{a.label}</span>
                <span className="block text-xs text-muted">{a.hint}</span>
              </span>
              <span className="text-xs font-bold text-muted">{a.extraMl ? `+${a.extraMl} ml` : 'Base'}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function GoalPreview({ weightKg, gender, activity }: { weightKg: number; gender: Gender; activity: Activity }) {
  const g = goalBreakdown({ weightKg, gender, activity })
  const rows = [
    { label: `${weightKg || 0} kg × 33 ml`, value: g.base },
    { label: 'Activity', value: g.activityAdj },
    ...(g.genderAdj ? [{ label: 'Sex adjustment', value: g.genderAdj }] : []),
  ]
  return (
    <div className="rounded-3xl bg-tide-600 p-5 text-white">
      <p className="text-sm font-semibold text-tide-100">Your daily goal</p>
      <motion.p
        key={g.total}
        initial={{ opacity: 0.4, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="font-display text-4xl font-extrabold tracking-tight"
      >
        {(g.total / 1000).toFixed(2)} L
      </motion.p>
      <dl className="mt-3 space-y-1 text-sm text-tide-100">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-4">
            <dt>{r.label}</dt>
            <dd className="font-semibold tabular-nums text-white">
              {r.value > 0 && r !== rows[0] ? '+' : ''}
              {r.value.toLocaleString()} ml
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-tide-200">Rounded to the nearest 50 ml, kept between 1.2 and 5 L.</p>
    </div>
  )
}
