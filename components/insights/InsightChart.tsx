'use client'

import { useReducedMotion } from 'framer-motion'
import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts'
import type { InsightDay } from '@/lib/insights/analyze'
import {
  METRIC_META,
  MIN_OVERLAP_DAYS,
  formatMetric,
  metricLabel,
  overlapDays,
  seriesFor,
  shortDate,
  type Metric,
} from '@/lib/insights/series'

/* ------------------------------------------------------------------
 * Trend chart for the "Explore data" deep dive: Metric A as soft bars in
 * the background, Metric B as a line on top, over the last 30 days.
 *
 * Two y-axes can make any two series look related just by how each is
 * stretched. To keep this one honest, BOTH axes use fixed, zero-based
 * scales (water from 0 L, sleep 0–12 h, mood 1–5) instead of zooming to
 * each series' own min and max.
 * ------------------------------------------------------------------ */

const GRID = '#E4EDEC'
const AXIS_TEXT = '#557178'

interface Row {
  date: string
  label: string
  a: number | null
  b: number | null
}

/** Fixed, zero-based domain and clean ticks per metric. */
function scale(metric: Metric, values: number[], goalMl?: number): { domain: [number, number]; ticks: number[] } {
  const max = values.length ? Math.max(...values) : 0
  if (metric === 'water') {
    const top = Math.max(4500, Math.ceil(Math.max(max, (goalMl ?? 0) * 1.15) / 1500) * 1500)
    return { domain: [0, top], ticks: [0, top / 3, (top * 2) / 3, top] }
  }
  if (metric === 'sleep') {
    const top = Math.max(720, Math.ceil(max / 240) * 240)
    return { domain: [0, top], ticks: Array.from({ length: top / 240 + 1 }, (_, i) => i * 240) }
  }
  return { domain: [0, 5], ticks: [1, 3, 5] }
}

const tick = (metric: Metric) => (v: number) =>
  metric === 'water' ? `${Number((v / 1000).toFixed(1))} L` : metric === 'sleep' ? `${Math.round(v / 60)}h` : String(v)

function ChartTooltip({ active, payload, metricA, metricB }: TooltipProps<number, string> & { metricA: Metric; metricB: Metric }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as Row
  const items: { metric: Metric; other: Metric; value: number | null; kind: 'bar' | 'line' }[] = [
    { metric: metricA, other: metricB, value: row.a, kind: 'bar' },
    { metric: metricB, other: metricA, value: row.b, kind: 'line' },
  ]
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-xs shadow-md ring-1 ring-line">
      <p className="mb-1 font-semibold text-muted">{shortDate(row.date)}</p>
      {items.map((it) => (
        <p key={it.kind} className="flex items-center gap-2">
          <span
            className={it.kind === 'bar' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3 rounded-full'}
            style={{ background: METRIC_META[it.metric].color, opacity: it.kind === 'bar' ? 0.55 : 1 }}
            aria-hidden
          />
          <span className="font-bold text-ink">{it.value === null ? '—' : formatMetric(it.metric, it.value)}</span>
          <span className="text-muted">{metricLabel(it.metric, it.other).toLowerCase()}</span>
        </p>
      ))}
    </div>
  )
}

/**
 * Metric A (bars) and Metric B (line) per day. Renders a gentle prompt
 * instead of a chart when fewer than MIN_OVERLAP_DAYS days have both.
 */
export function InsightChart({
  days,
  metricA,
  metricB,
  goalMl,
}: {
  days: InsightDay[]
  metricA: Metric
  metricB: Metric
  /** Drawn as a reference line when Metric A is water. */
  goalMl?: number
}) {
  const reduce = useReducedMotion()
  const a = useMemo(() => seriesFor(metricA, metricB, days), [metricA, metricB, days])
  const b = useMemo(() => seriesFor(metricB, metricA, days), [metricA, metricB, days])
  const overlap = overlapDays(a, b)
  const labelA = metricLabel(metricA, metricB)
  const labelB = metricLabel(metricB, metricA)

  if (overlap < MIN_OVERLAP_DAYS) {
    const left = MIN_OVERLAP_DAYS - overlap
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
        <p className="font-display text-base font-bold">Keep logging to unlock this insight</p>
        <p className="max-w-xs text-sm text-muted">
          Log {METRIC_META[metricA].label.toLowerCase()} and {labelB.toLowerCase()} on {left} more {left === 1 ? 'day' : 'days'} to see how
          they move together.
        </p>
        <div className="mt-2 flex gap-1" aria-label={`${overlap} of ${MIN_OVERLAP_DAYS} days logged`}>
          {Array.from({ length: MIN_OVERLAP_DAYS }, (_, i) => (
            <span key={i} className={`h-1.5 w-5 rounded-full ${i < overlap ? 'bg-emerald-500' : 'bg-line'}`} />
          ))}
        </div>
      </div>
    )
  }

  const rows: Row[] = days.map((d, i) => ({ date: d.date, label: shortDate(d.date), a: a[i], b: b[i] }))
  const sa = scale(metricA, a.filter((v): v is number => v !== null), goalMl)
  const sb = scale(metricB, b.filter((v): v is number => v !== null))
  const colorA = METRIC_META[metricA].color
  const colorB = METRIC_META[metricB].color

  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colorA, opacity: 0.55 }} aria-hidden />
          {labelA} <span className="font-normal text-muted">(bars, left)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: colorB }} aria-hidden />
          {labelB} <span className="font-normal text-muted">(line, right)</span>
        </span>
      </div>
      <div className="h-60 w-full" role="img" aria-label={`${labelA} as bars and ${labelB} as a line, ${rows[0].label} to ${rows[rows.length - 1].label}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap="20%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: GRID }}
              tick={{ fontSize: 10, fill: AXIS_TEXT }}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              yAxisId="a"
              domain={sa.domain}
              ticks={sa.ticks}
              tickFormatter={tick(metricA)}
              tick={{ fontSize: 10, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <YAxis
              yAxisId="b"
              orientation="right"
              domain={sb.domain}
              ticks={sb.ticks}
              tickFormatter={tick(metricB)}
              tick={{ fontSize: 10, fill: AXIS_TEXT }}
              tickLine={false}
              axisLine={false}
              width={34}
            />
            {metricA === 'water' && goalMl ? (
              <ReferenceLine
                yAxisId="a"
                y={goalMl}
                stroke="#10B981"
                strokeOpacity={0.7}
                label={{ value: 'Goal', position: 'insideTopLeft', fontSize: 10, fill: '#047857' }}
              />
            ) : null}
            <Tooltip
              cursor={{ fill: '#0F2F37', fillOpacity: 0.04 }}
              content={<ChartTooltip metricA={metricA} metricB={metricB} />}
            />
            <Bar
              yAxisId="a"
              dataKey="a"
              fill={colorA}
              fillOpacity={0.3}
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={!reduce}
            />
            <Line
              yAxisId="b"
              dataKey="b"
              type="monotone"
              stroke={colorB}
              strokeWidth={2}
              connectNulls={false}
              // Only mark days that have no neighbour to draw a line to.
              dot={(p: { cx?: number; cy?: number; index?: number }) => {
                const i = p.index ?? 0
                const isolated = b[i] !== null && b[i - 1] == null && b[i + 1] == null
                return isolated && p.cx != null && p.cy != null ? (
                  <circle key={i} cx={p.cx} cy={p.cy} r={4} fill={colorB} stroke="#fff" strokeWidth={2} />
                ) : (
                  <g key={i} />
                )
              }}
              activeDot={{ r: 5, fill: colorB, stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={!reduce}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-xs text-muted">
        Both scales start at zero, so the shapes compare fairly. Hover or tap a day for its values.
      </figcaption>
    </figure>
  )
}
