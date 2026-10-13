'use client'

import { ArrowLeft, ArrowRight, Check, Loader2, Lock, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { NOT_ADVICE } from '@/components/programmes/ProgrammesView'
import { PremiumCard } from '@/components/plans/PremiumGate'
import { programmeState, type Programme } from '@/lib/content/programmes'
import { FREE_PROGRAMME } from '@/lib/plans'
import { usePlan } from '@/lib/usePlan'
import { TRACKERS } from '@/lib/trackers'
import { useProgrammes } from '@/lib/useProgrammes'

/** /programmes/[id]: the days, today's step open, and marking days done. */
export function ProgrammeView({ programme: p }: { programme: Programme }) {
  const { enrolments, ready, error, start, setDay, leave } = useProgrammes()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const opened = useRef(false)
  const t = TRACKERS.find((x) => x.id === p.topic)!
  const Icon = t.icon
  const e = enrolments?.[p.id]
  const s = e ? programmeState(p, e) : null
  const plan = usePlan()
  // Every programme except the free one is Premium (the database enforces it too).
  const locked = !!plan && !plan.premium && p.id !== FREE_PROGRAMME

  // Open today's step (or the one in the URL, e.g. from Home: #day-3) once progress has loaded.
  useEffect(() => {
    if (!enrolments || opened.current) return
    opened.current = true
    const fromHash = Number(window.location.hash.match(/^#day-(\d+)$/)?.[1])
    setOpen(fromHash && s && fromHash <= s.unlocked ? fromHash : (s?.next ?? (s ? null : 1)))
  }, [enrolments, s])

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    await fn()
    setBusy(null)
  }

  return (
    <>
      <Link href="/programmes" className="mb-4 inline-flex items-center gap-1 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All programmes
      </Link>

      <header className="mb-6 flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: t.accent }}>
          <Icon className="h-7 w-7" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-extrabold leading-tight">{p.title}</h1>
          <p className="text-muted">{p.summary}</p>
          {s && (
            <p className="mt-1 text-sm font-bold" aria-live="polite">
              {s.finished ? 'Finished. Well done!' : `${s.done.size} of ${p.days.length} days done`}
            </p>
          )}
        </div>
      </header>

      {!ready && <p className="notice-error mb-6">Programmes aren’t set up yet. Run supabase/programmes.sql in Supabase first.</p>}
      {error && <p role="alert" className="notice-error mb-6">{error}</p>}

      {locked && (
        <div className="mb-6">
          <PremiumCard feature="programmes" />
        </div>
      )}

      {enrolments && !e && ready && !locked && (
        <div className="mb-6 rounded-3xl bg-white p-5 ring-1 ring-line">
          <p className="font-bold">{p.days.length} days, one small step each day</p>
          <p className="mt-1 text-sm text-muted">A new day unlocks each day after you start. Take your time; you can do a day later if you miss one.</p>
          <button type="button" className="btn-primary mt-4" disabled={busy !== null} onClick={() => run('start', () => start(p.id))}>
            {busy === 'start' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Start today
          </button>
        </div>
      )}

      <ol className="space-y-3">
        {p.days.map((d, i) => {
          const n = i + 1
          const dayLocked = locked || !s || n > s.unlocked
          const done = !!s?.done.has(n)
          const expanded = open === n && !dayLocked
          return (
            <li key={n} id={`day-${n}`} className="scroll-mt-6 rounded-2xl bg-white ring-1 ring-line">
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-2xl p-4 text-left disabled:cursor-default"
                aria-expanded={dayLocked ? undefined : expanded}
                aria-controls={`day-${n}-body`}
                disabled={dayLocked}
                onClick={() => setOpen(expanded ? null : n)}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${done ? 'text-white' : dayLocked ? 'bg-mist text-muted' : 'ring-2'}`}
                  style={done ? { background: t.accent } : dayLocked ? undefined : { color: t.accent, ['--tw-ring-color' as string]: t.accent }}
                >
                  {done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : dayLocked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wide text-muted">Day {n}</span>
                  <span className={`block font-bold ${dayLocked ? 'text-muted' : ''}`}>{d.title}</span>
                </span>
                <span className="sr-only">{done ? ', done' : dayLocked ? (s ? ', unlocks on a later day' : ', start the programme to unlock') : ''}</span>
              </button>
              {expanded && (
                <div id={`day-${n}-body`} className="border-t border-line px-4 pb-4 pt-3">
                  <p className="text-ink/85">{d.body}</p>
                  <div className="mt-3 rounded-xl p-3" style={{ background: `${t.accent}14` }}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: t.accent }}>
                      Today’s step
                    </p>
                    <p className="mt-0.5 font-semibold">{d.action}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className={done ? 'btn-secondary' : 'btn-primary'}
                      disabled={busy !== null}
                      aria-pressed={done}
                      onClick={() =>
                        run(`day-${n}`, async () => {
                          const ok = await setDay(p.id, n, !done)
                          // Close the day once it's done, so the next one is easy to find.
                          if (ok && !done) setOpen(null)
                        })
                      }
                    >
                      {busy === `day-${n}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                      {done ? 'Done · undo' : 'Mark as done'}
                    </button>
                    {d.link && (
                      <Link href={d.link.href} className="btn-secondary">
                        {d.link.label} <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {e && !locked && (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => {
              if (window.confirm(`Start ${p.title} again from day 1? Your ticks will be cleared.`)) run('restart', () => start(p.id)).then(() => setOpen(1))
            }}
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> Start again
          </button>
          {!s?.finished && (
            <button
              type="button"
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm(`Leave ${p.title}? Your progress will be removed.`)) run('leave', () => leave(p.id)).then(() => setOpen(null))
              }}
            >
              Leave programme
            </button>
          )}
        </div>
      )}

      <p className="mt-6 text-xs text-muted">{NOT_ADVICE}</p>
    </>
  )
}
