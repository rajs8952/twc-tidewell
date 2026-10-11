'use client'

import { Check, ChevronRight, Flame } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { CompletionRing } from '@rajs8952/ui'
import type { HubSummary } from '@rajs8952/trackers/hub'
import type { TrackerModule } from '@/lib/trackers'

/**
 * One tracker's at-a-glance card on the Hub. The top links to the tracker's
 * page; `actions` (quick logging) sit below it, outside the link, so they're
 * real buttons of their own. A streak shows from 2 days (or weeks) in a row.
 */
export function HubCard({
  tracker,
  summary,
  focus = false,
  streak,
  actions,
}: {
  tracker: TrackerModule
  summary: HubSummary | null
  focus?: boolean
  streak?: { n: number; unit: 'day' | 'week' }
  actions?: ReactNode
}) {
  const Icon = tracker.icon
  const pct = summary?.progress == null ? null : Math.round(summary.progress * 100)
  const showStreak = !!streak && streak.n >= 2
  const streakText = showStreak ? `${streak!.n}-${streak!.unit} streak` : ''
  const label = summary
    ? `${tracker.name}: ${summary.value}, ${summary.caption}${pct !== null ? `, ${pct}% of goal` : ''}${summary.done ? ', goal met' : summary.logged ? ', logged' : ''}${showStreak ? `, ${streakText}` : ''}.`
    : `${tracker.name}: loading.`

  return (
    <div
      className="group rounded-3xl bg-white ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(15,47,55,0.45)] hover:ring-[color:var(--accent)]"
      style={{ ['--accent' as string]: `${tracker.accent}66` }}
    >
      <Link href={tracker.href} aria-label={label} className="flex items-center gap-4 rounded-3xl p-4">
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
              {focus && <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted ring-1 ring-line">Focus</span>}
            </span>
            {summary?.done ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> Goal met
              </span>
            ) : summary?.logged ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[11px] font-bold text-ink ring-1 ring-line">
                <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> Logged
              </span>
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5" aria-hidden />
            )}
          </div>
          {summary ? (
            <>
              <p className="mt-1 truncate font-display text-lg font-extrabold leading-tight">{summary.value}</p>
              <p className="truncate text-xs text-muted sm:text-sm">{summary.caption}</p>
              {showStreak && (
                <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#B9650E]">
                  <Flame className="h-3.5 w-3.5" aria-hidden /> {streakText}
                </p>
              )}
            </>
          ) : (
            <div className="mt-2 space-y-1.5">
              <div className="h-4 w-20 animate-pulse rounded bg-mist" />
              <div className="h-3 w-28 animate-pulse rounded bg-mist" />
            </div>
          )}
        </div>
      </Link>
      {actions && <div className="border-t border-line px-4 py-2.5">{actions}</div>}
    </div>
  )
}
