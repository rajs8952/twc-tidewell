'use client'

import { BookOpen, Check, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { PageHeader } from '@/components/PageHeader'
import { PROGRAMMES, programmeState } from '@/lib/content/programmes'
import { FREE_PROGRAMME } from '@/lib/plans'
import { usePlan } from '@/lib/usePlan'
import { TRACKERS } from '@/lib/trackers'
import { useProfile } from '@/lib/useProfile'
import { useProgrammes } from '@/lib/useProgrammes'

export const PROGRAMMES_ACCENT = '#B9650E'

export const NOT_ADVICE = 'General wellbeing guidance, not medical advice. If you have a health condition, check with your doctor first.'

/** /programmes: every programme, with your progress; the ones matching your focus first. */
export function ProgrammesView() {
  const { enrolments, ready, error } = useProgrammes()
  const { profile } = useProfile()
  const focus = profile?.focus_trackers ?? []
  const free = usePlan()?.premium === false
  const ordered = [...PROGRAMMES].sort((a, b) => Number(focus.includes(b.topic)) - Number(focus.includes(a.topic)))

  return (
    <>
      <PageHeader title="Programmes" description="One small step a day, for a week or less." icon={BookOpen} accent={PROGRAMMES_ACCENT} />

      {!ready && <p className="notice-error mb-6">Programmes aren’t set up yet. Run supabase/programmes.sql in Supabase first.</p>}
      {error && <p role="alert" className="notice-error mb-6">{error}</p>}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {ordered.map((p) => {
          const t = TRACKERS.find((x) => x.id === p.topic)!
          const Icon = t.icon
          const e = enrolments?.[p.id]
          const s = e ? programmeState(p, e) : null
          const status = !s
            ? `${p.days.length} days`
            : s.finished
              ? 'Finished'
              : s.next
                ? `Day ${s.next} of ${p.days.length} is ready`
                : `${s.done.size} of ${p.days.length} days done · next day unlocks tomorrow`
          return (
            <li key={p.id}>
              <Link href={`/programmes/${p.id}`} className="group flex h-full gap-4 rounded-3xl bg-white p-4 ring-1 ring-line transition hover:ring-[color:var(--accent)]" style={{ ['--accent' as string]: `${t.accent}88` }}>
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: t.accent }}>
                  <Icon className="h-6 w-6" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-bold">
                    {p.title}
                    {free && p.id !== FREE_PROGRAMME && <span className="rounded-full bg-[#FFF1D9] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8A4B0A] ring-1 ring-[#F2D3A8]">Premium</span>}
                    {focus.includes(p.topic) && <span className="rounded-full bg-mist px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted ring-1 ring-line">For you</span>}
                  </span>
                  <span className="block text-sm text-muted">{p.summary}</span>
                  {s && (
                    <span className="mt-2 flex gap-1" aria-hidden>
                      {p.days.map((_, i) => (
                        <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: s.done.has(i + 1) ? t.accent : '#D3E2E0' }} />
                      ))}
                    </span>
                  )}
                  <span className={`mt-1.5 flex items-center gap-1 text-xs font-bold ${s?.finished ? 'text-emerald-700' : s?.next ? 'text-ink' : 'text-muted'}`}>
                    {s?.finished && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
                    {status}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 self-center text-muted transition group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-xs text-muted">{NOT_ADVICE}</p>
    </>
  )
}
