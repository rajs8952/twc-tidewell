'use client'

import { Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { CompletionRing } from '@rajs8952/ui'
import type { HubSummary } from '@rajs8952/trackers/hub'
import type { TrackerModule } from '@/lib/trackers'

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
