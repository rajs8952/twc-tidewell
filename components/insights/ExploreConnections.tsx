'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import type { Insight, InsightDay } from '@/lib/insights/analyze'
import {
  METRIC_META,
  METRIC_ORDER,
  MIN_OVERLAP_DAYS,
  formatMetric,
  metricLabel,
  overlapDays,
  seriesFor,
  shortDate,
  type Metric,
} from '@/lib/insights/series'

/* ------------------------------------------------------------------
 * "Explore data": the optional deep dive, hidden behind a button so the
 * main view stays clean. Pick Metric A (bars) and Metric B (line) and see
 * them over the last 30 days. Plain words only: no statistics.
 * ------------------------------------------------------------------ */

// Recharts is large; load it only when someone opens "Explore data".
const InsightChart = dynamic(() => import('@/components/insights/InsightChart').then((m) => m.InsightChart), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-mist/60" aria-busy="true" aria-label="Loading chart" />,
})

const PAIR_ID: Record<string, Insight['id']> = {
  'sleep|water': 'water-next-sleep',
  'mood|sleep': 'sleep-mood',
  'mood|water': 'water-mood',
}
const pairId = (a: Metric, b: Metric) => PAIR_ID[[a, b].sort().join('|')]

function Chips({ label, hint, value, onChange }: { label: string; hint: string; value: Metric; onChange: (m: Metric) => void }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
      <span className="shrink-0 text-xs font-bold text-muted sm:w-28">
        {label} <span className="font-semibold">· {hint}</span>
      </span>
      <div role="radiogroup" aria-label={`${label} (${hint})`} className="flex flex-wrap gap-1.5">
        {METRIC_ORDER.map((m) => {
          const on = m === value
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(m)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition ${
                on ? 'bg-ink text-white' : 'bg-mist text-ink hover:bg-tide-50'
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: METRIC_META[m].color }} aria-hidden />
              {METRIC_META[m].label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ExploreConnections({ days, insights, goalMl }: { days: InsightDay[]; insights: Insight[]; goalMl?: number }) {
  const [open, setOpen] = useState(false)
  // One state for both so a swap never reads a stale partner (rapid taps before a re-render).
  const [{ a, b }, setPair] = useState<{ a: Metric; b: Metric }>({ a: 'water', b: 'sleep' })
  // Picking the other side's metric swaps the two.
  const pickA = (m: Metric) => setPair((p) => (m === p.b ? { a: m, b: p.a } : { ...p, a: m }))
  const pickB = (m: Metric) => setPair((p) => (m === p.a ? { a: p.b, b: m } : { ...p, b: m }))

  const va = useMemo(() => seriesFor(a, b, days), [a, b, days])
  const vb = useMemo(() => seriesFor(b, a, days), [a, b, days])
  const labels = [metricLabel(a, b), metricLabel(b, a)] as const
  const insight = insights.find((i) => i.id === pairId(a, b))
  const enough = overlapDays(va, vb) >= MIN_OVERLAP_DAYS

  return (
    <section aria-label="Explore connections" className="rounded-3xl bg-white/60 ring-1 ring-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="explore-panel"
        className="flex w-full items-center justify-between gap-3 rounded-3xl px-5 py-4 text-left sm:px-6"
      >
        <span>
          <span className="block font-bold">Explore data</span>
          <span className="block text-sm text-muted">Compare two habits over the last {days.length} days</span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="explore-panel"
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="space-y-2">
                <Chips label="Metric A" hint="bars" value={a} onChange={pickA} />
                <Chips label="Metric B" hint="line" value={b} onChange={pickB} />
              </div>

              <div className="rounded-2xl bg-white p-3 ring-1 ring-line sm:p-4">
                <InsightChart days={days} metricA={a} metricB={b} goalMl={goalMl} />
              </div>

              {insight && enough && insight.level !== 'insufficient' && (
                <p className="text-sm">
                  <span className="font-bold">{insight.headline}.</span> {insight.message}
                </p>
              )}

              <details className="text-sm">
                <summary className="cursor-pointer font-bold text-tide-600">View as table</summary>
                <div className="mt-2 max-h-64 overflow-auto rounded-xl ring-1 ring-line">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-mist">
                      <tr>
                        <th className="px-3 py-2 font-bold">Date</th>
                        <th className="px-3 py-2 font-bold">{labels[0]}</th>
                        <th className="px-3 py-2 font-bold">{labels[1]}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line bg-white tabular-nums">
                      {days
                        .map((d, i) => ({ d: d.date, x: va[i], y: vb[i] }))
                        .filter((r) => r.x !== null || r.y !== null)
                        .reverse()
                        .map((r) => (
                          <tr key={r.d}>
                            <td className="px-3 py-1.5">{shortDate(r.d)}</td>
                            <td className="px-3 py-1.5">{r.x === null ? '—' : formatMetric(a, r.x)}</td>
                            <td className="px-3 py-1.5">{r.y === null ? '—' : formatMetric(b, r.y)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
