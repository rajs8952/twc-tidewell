'use client'

import { ArrowRight, BookOpen, Lightbulb } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { PROGRAMMES, PROGRAMME_BY_ID, programmeState } from '@/lib/content/programmes'
import { FREE_PROGRAMME } from '@/lib/plans'
import { usePlan } from '@/lib/usePlan'
import { tipOfTheDay } from '@/lib/content/tips'
import { TRACKERS } from '@/lib/trackers'
import { useProgrammes } from '@/lib/useProgrammes'

/**
 * "For you today" on Home: today's step in any programme in progress (or a
 * suggestion to start one that matches your focus), and the tip of the day.
 */
export function ForYouToday({ focus }: { focus: string[] }) {
  const { enrolments, ready } = useProgrammes()
  // Free plan: only the free programme is shown or suggested.
  const free = usePlan()?.premium === false
  const tip = useMemo(() => tipOfTheDay(new Date(), focus), [focus])
  const tipTracker = TRACKERS.find((t) => t.id === tip.topic)!
  const TipIcon = tipTracker.icon

  // Programmes with a step ready today, then any in progress; otherwise one to suggest.
  const active = PROGRAMMES.flatMap((p) => {
    const e = enrolments?.[p.id]
    if (!e || (free && p.id !== FREE_PROGRAMME)) return []
    const s = programmeState(p, e)
    return s.finished ? [] : [{ p, s }]
  }).sort((a, b) => Number(!!b.s.next) - Number(!!a.s.next))
  const suggestion =
    enrolments && !Object.keys(enrolments).length
      ? free
        ? PROGRAMME_BY_ID[FREE_PROGRAMME]!
        : (PROGRAMMES.find((p) => focus.includes(p.topic)) ?? PROGRAMMES[0]!)
      : null

  return (
    <section aria-labelledby="for-you-title" className="mt-10">
      <h2 id="for-you-title" className="mb-4 text-lg font-bold">
        For you today
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ready &&
          active.slice(0, 2).map(({ p, s }) => {
            const t = TRACKERS.find((x) => x.id === p.topic)!
            const day = s.next ? p.days[s.next - 1]! : null
            return (
              <Link
                key={p.id}
                href={`/programmes/${p.id}${s.next ? `#day-${s.next}` : ''}`}
                className="group flex gap-3 rounded-3xl bg-white p-4 ring-1 ring-line transition hover:ring-[color:var(--accent)]"
                style={{ ['--accent' as string]: `${t.accent}88` }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: t.accent }}>
                  <BookOpen className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-muted">
                    {p.title} · {s.next ? `Day ${s.next} of ${p.days.length}` : `${s.done.size} of ${p.days.length} done`}
                  </span>
                  <span className="block font-bold">{day ? day.title : 'All caught up. The next day unlocks tomorrow.'}</span>
                  {day && <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{day.action}</span>}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )
          })}

        {ready && suggestion && (
          <Link href={`/programmes/${suggestion.id}`} className="group flex gap-3 rounded-3xl border border-dashed border-line bg-white/60 p-4 transition hover:bg-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-mist text-[#B9650E]">
              <BookOpen className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide text-muted">Try a programme · {suggestion.days.length} days</span>
              <span className="block font-bold">{suggestion.title}</span>
              <span className="mt-0.5 block text-sm text-muted">{suggestion.summary}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 self-center text-muted transition group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}

        <article className="flex gap-3 rounded-3xl bg-white p-4 ring-1 ring-line" aria-labelledby="tip-title">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#FDF1D6] text-[#B97C0E]">
            <Lightbulb className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
              Tip of the day · <TipIcon className="h-3.5 w-3.5" style={{ color: tipTracker.accent }} aria-hidden /> {tipTracker.name}
            </p>
            <h3 id="tip-title" className="font-bold">
              {tip.title}
            </h3>
            <p className="mt-0.5 text-sm text-ink/80">{tip.body}</p>
          </div>
        </article>
      </div>
      <p className="mt-3 text-sm">
        <Link href="/programmes" className="inline-flex items-center gap-1 font-bold text-[#8A4B0A] hover:underline">
          All programmes <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </p>
    </section>
  )
}
