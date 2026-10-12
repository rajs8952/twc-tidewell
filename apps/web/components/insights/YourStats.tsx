'use client'

import { ArrowRight, Link2 } from 'lucide-react'
import Link from 'next/link'
import { parseDayKey } from '@rajs8952/core/dates'
import { CALM_LABELS } from '@rajs8952/core/meditation'
import { MOOD_BY_ID } from '@rajs8952/core/mood'
import { fmtMin, moodWord, type StatsResult, type Together } from '@/lib/insights/stats'
import { TRACKERS, type TrackerId } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * "Your last 30 days" on Insights: a few plain numbers per tracker, and
 * "habits that go together". All of it works from the second entry.
 * ------------------------------------------------------------------ */

const day = (k: string) => parseDayKey(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const ml = (n: number) => `${n.toLocaleString()} ml`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

interface Line {
  label: string
  value: string
}

/** What each tracker's card says: a big number, a caption and up to three facts. */
function linesFor(id: TrackerId, s: StatsResult['trackers']): { big: string; caption: string; facts: Line[] } | null {
  switch (id) {
    case 'water': {
      const w = s.water
      if (!w) return null
      return {
        big: ml(w.avgMl),
        caption: `a day, on ${plural(w.days, 'day')} logged`,
        facts: [
          { label: 'Goal met', value: plural(w.goalDays, 'day') },
          { label: 'Best day', value: `${ml(w.best.value)}, ${day(w.best.date)}` },
        ],
      }
    }
    case 'sleep': {
      const z = s.sleep
      if (!z) return null
      return {
        big: z.avgMin != null ? fmtMin(z.avgMin) : fmtMin(z.longest.value),
        caption: z.avgMin != null ? `a night, over ${plural(z.nights, 'night')}` : 'your first night logged',
        facts: [
          ...(z.avgQuality != null ? [{ label: 'Quality', value: `${z.avgQuality.toFixed(1)} of 5` }] : []),
          { label: 'Goal met', value: plural(z.goalNights, 'night') },
          ...(z.nights >= 2 ? [{ label: 'Longest', value: `${fmtMin(z.longest.value)}, ${day(z.longest.date)}` }] : []),
        ],
      }
    }
    case 'mood': {
      const m = s.mood
      if (!m) return null
      return {
        big: m.avgScore != null ? `Mostly ${moodWord(m.avgScore).toLowerCase()}` : MOOD_BY_ID[m.common].label,
        caption: `over ${plural(m.checkIns, 'check-in')} on ${plural(m.days, 'day')}`,
        facts: [
          ...(m.topEmotions.length ? [{ label: 'Felt most', value: m.topEmotions.join(', ') }] : []),
          ...(m.avgStress != null ? [{ label: 'Stress', value: `${m.avgStress.toFixed(1)} of 5 on average` }] : []),
          ...(m.bestWeekday ? [{ label: 'Best day', value: `You tend to feel best on ${m.bestWeekday}` }] : []),
        ],
      }
    }
    case 'exercise': {
      const x = s.exercise
      if (!x) return null
      return {
        big: fmtMin(x.totalMin),
        caption: `in ${plural(x.sessions, 'session')}`,
        facts: [
          { label: 'A week', value: `${fmtMin(x.avgWeekMin)} on average` },
          { label: 'Most often', value: x.favourite },
          ...(x.sessions >= 2 ? [{ label: 'Longest day', value: `${fmtMin(x.longest.value)}, ${day(x.longest.date)}` }] : []),
        ],
      }
    }
    case 'meditation': {
      const d = s.meditation
      if (!d) return null
      const calm = d.calm
      return {
        big: fmtMin(d.totalMin),
        caption: `in ${plural(d.sessions, 'session')}, ${fmtMin(d.avgMin)} each`,
        facts: [
          ...(calm
            ? [
                {
                  label: 'Calm',
                  value:
                    calm.after > calm.before
                      ? `${CALM_LABELS[Math.round(calm.before) - 1]} → ${CALM_LABELS[Math.round(calm.after) - 1]!.toLowerCase()}, up ${(calm.after - calm.before).toFixed(1)}`
                      : `${CALM_LABELS[Math.round(calm.after) - 1]} after, on average`,
                },
              ]
            : []),
          { label: 'Most often', value: d.favourite },
        ],
      }
    }
    case 'weight': {
      const w = s.weight
      if (!w) return null
      return {
        big: `${w.latest.toFixed(1)} kg`,
        caption: w.change == null ? 'your first weigh-in' : `latest of ${plural(w.entries, 'weigh-in')}`,
        facts:
          w.change == null
            ? []
            : [
                { label: 'Change', value: w.change === 0 ? 'No change' : `${w.change > 0 ? '+' : '−'}${Math.abs(w.change).toFixed(1)} kg since ${w.first.toFixed(1)} kg` },
                { label: 'Range', value: `${w.low.toFixed(1)}–${w.high.toFixed(1)} kg` },
              ],
      }
    }
  }
}

function TogetherCard({ t }: { t: Together }) {
  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="font-bold">{t.sentence}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-mist p-2.5">
          <dt className="text-xs text-muted">{t.withLabel}</dt>
          <dd className="font-bold">{t.withValue}</dd>
          <dd className="text-xs text-muted">{[t.withDetail, plural(t.nWith, 'day')].filter(Boolean).join(' · ')}</dd>
        </div>
        <div className="rounded-xl bg-mist p-2.5">
          <dt className="text-xs text-muted">{t.withoutLabel}</dt>
          <dd className="font-bold">{t.withoutValue}</dd>
          <dd className="text-xs text-muted">{[t.withoutDetail, plural(t.nWithout, 'day')].filter(Boolean).join(' · ')}</dd>
        </div>
      </dl>
      {t.early && <p className="mt-2 text-xs text-muted">An early sign from a few days. Keep logging to see if it holds.</p>}
    </li>
  )
}

export function YourStats({ stats }: { stats: StatsResult | null }) {
  if (!stats) {
    return (
      <section aria-label="Your last 30 days, loading" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TRACKERS.map((t) => (
          <div key={t.id} className="h-36 animate-pulse rounded-2xl bg-white ring-1 ring-line" />
        ))}
      </section>
    )
  }

  const cards = TRACKERS.map((t) => ({ t, l: linesFor(t.id, stats.trackers) }))
  // Trackers with entries first, then the ones still to try.
  const logged = cards.filter((c) => c.l)
  const empty = cards.filter((c) => !c.l)

  return (
    <>
      <section aria-labelledby="stats-title">
        <h2 id="stats-title" className="text-lg font-bold">
          Your last {stats.span} days
        </h2>
        <p className="text-sm text-muted">
          {stats.activeDays ? `You logged something on ${plural(stats.activeDays, 'day')}.` : 'Nothing logged yet. Your numbers appear here from your first entry.'}
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {logged.map(({ t, l }) => {
            const Icon = t.icon
            return (
              <li key={t.id}>
                <Link href={t.href} className="block h-full rounded-2xl bg-white p-4 ring-1 ring-line transition hover:ring-[color:var(--accent)]" style={{ ['--accent' as string]: `${t.accent}88` }}>
                  <p className="flex items-center gap-1.5 text-sm font-bold">
                    <Icon className="h-4 w-4" style={{ color: t.accent }} aria-hidden />
                    {t.name}
                  </p>
                  <p className="mt-2 font-display text-2xl font-extrabold leading-tight">{l!.big}</p>
                  <p className="text-xs text-muted">{l!.caption}</p>
                  {l!.facts.length > 0 && (
                    <dl className="mt-3 space-y-1 border-t border-line pt-3 text-sm">
                      {l!.facts.map((f) => (
                        <div key={f.label} className="flex justify-between gap-3">
                          <dt className="shrink-0 text-muted">{f.label}</dt>
                          <dd className="text-right font-semibold">{f.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </Link>
              </li>
            )
          })}
          {empty.map(({ t }) => {
            const Icon = t.icon
            return (
              <li key={t.id}>
                <Link href={t.href} className="flex h-full items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted hover:bg-white">
                  <Icon className="h-5 w-5 shrink-0" style={{ color: t.accent }} aria-hidden />
                  <span className="flex-1">
                    <span className="font-bold text-ink">{t.name}</span>: nothing logged in the last {stats.span} days.
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="together-title">
        <h2 id="together-title" className="flex items-center gap-2 text-lg font-bold">
          <Link2 className="h-5 w-5 text-[#6A55C9]" aria-hidden />
          Habits that go together
        </h2>
        {stats.together.length ? (
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {stats.together.map((t) => (
              <TogetherCard key={t.id} t={t} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Log exercise or meditation alongside your mood and sleep on a few days, and we’ll show you how they go together. You need at least two days with
            the habit and two without.
          </p>
        )}
      </section>
    </>
  )
}
