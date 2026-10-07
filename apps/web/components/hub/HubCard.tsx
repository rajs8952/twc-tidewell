'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import type { HubSummary } from '@/lib/hub'
import type { TrackerModule } from '@/lib/trackers'

/** Circular daily-completion ring; the track is a pale tint of the tracker's colour. */
export function CompletionRing({ progress, color, size = 76 }: { progress: number | null; color: string; size?: number }) {
  const reduce = useReducedMotion()
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = progress ?? 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={stroke} />
      {progress !== null && p > 0 && (
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }}
        />
      )}
    </svg>
  )
}

/** One tracker's at-a-glance card on the Hub; the whole card links to its page. */
export function HubCard({ tracker, summary }: { tracker: TrackerModule; summary: HubSummary | null }) {
  const Icon = tracker.icon
  const pct = summary?.progress == null ? null : Math.round(summary.progress * 100)
  const label = summary
    ? `${tracker.name}: ${summary.value}, ${summary.caption}${pct !== null ? `, ${pct}% complete` : ''}${summary.done ? ', done' : ''}.`
    : `${tracker.name}: loading.`

  return (
    <Link
      href={tracker.href}
      aria-label={label}
      className="group flex items-center gap-4 rounded-3xl bg-white p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(15,47,55,0.45)] hover:ring-[color:var(--accent)]"
      style={{ ['--accent' as string]: `${tracker.accent}66` }}
    >
      <div className="relative shrink-0">
        {summary ? <CompletionRing progress={summary.progress} color={tracker.accent} size={68} /> : <div className="h-[68px] w-[68px] animate-pulse rounded-full bg-mist" />}
        <span className="absolute inset-0 flex items-center justify-center">
          {pct !== null ? (
            <span className="text-sm font-extrabold">{pct}%</span>
          ) : (
            <Icon className="h-5 w-5" style={{ color: tracker.accent }} aria-hidden />
          )}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-bold">
            <Icon className="h-4 w-4 shrink-0" style={{ color: tracker.accent }} aria-hidden />
            {tracker.name}
          </span>
          {summary?.done ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> Done
            </span>
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5" aria-hidden />
          )}
        </div>
        {summary ? (
          <>
            <p className="mt-1 truncate font-display text-lg font-extrabold leading-tight">{summary.value}</p>
            <p className="truncate text-xs text-muted sm:text-sm">{summary.caption}</p>
          </>
        ) : (
          <div className="mt-2 space-y-1.5">
            <div className="h-4 w-20 animate-pulse rounded bg-mist" />
            <div className="h-3 w-28 animate-pulse rounded bg-mist" />
          </div>
        )}
      </div>
    </Link>
  )
}
