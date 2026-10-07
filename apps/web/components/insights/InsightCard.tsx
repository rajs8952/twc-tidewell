'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'
import type { Comparison, Headline, HeadlineIcon } from '@/lib/insights/headline'

/* ------------------------------------------------------------------
 * The headline insight card: one bold, plain-English sentence, an icon
 * pairing, and the A-vs-B proof underneath. No statistics are shown:
 * only words, durations and mood scores.
 * ------------------------------------------------------------------ */

const DROP = 'M15 5C15 5 5.5 16.5 5.5 24a9.5 9.5 0 0 0 19 0C24.5 16.5 15 5 15 5Z'

/** Two shapes melting into each other: the first habit flowing into the second. */
export function IconPair({ icon }: { icon: HeadlineIcon }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const reduce = useReducedMotion()
  const float = reduce ? {} : { animate: { y: [0, -1.5, 0] }, transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const } }

  const drop = <path d={DROP} fill={`url(#${id}-water)`} />
  const moon = (
    <g mask={`url(#${id}-crescent)`}>
      <circle cx={33} cy={25} r={11} fill={`url(#${id}-night)`} />
    </g>
  )
  const smile = (
    <g>
      <circle cx={33} cy={25} r={11} fill={`url(#${id}-sun)`} />
      <circle cx={29.5} cy={22.5} r={1.4} fill="#fff" />
      <circle cx={36.5} cy={22.5} r={1.4} fill="#fff" />
      <path d="M28.5 27.5q4.5 4 9 0" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </g>
  )

  return (
    <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
      <defs>
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FCBF0" />
          <stop offset="1" stopColor="#2189D6" />
        </linearGradient>
        <linearGradient id={`${id}-night`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8E9CF0" />
          <stop offset="1" stopColor="#4A5BC4" />
        </linearGradient>
        <linearGradient id={`${id}-sun`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F9D27A" />
          <stop offset="1" stopColor="#E9A21F" />
        </linearGradient>
        <mask id={`${id}-crescent`}>
          <rect width="48" height="48" fill="#fff" />
          <circle cx={38.5} cy={20} r={8.5} fill="#000" />
        </mask>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.6" />
        </filter>
      </defs>
      <motion.g {...float}>
        {icon === 'collecting' ? (
          <g>
            <path d="M24 40V24" stroke="#4F9B5B" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M24 27c-1-6-6-9-12-8 0 6 5 10 12 8Z" fill="#7CC36A" />
            <path d="M24 23c1-7 7-11 14-10 0 7-6 12-14 10Z" fill="#4F9B5B" />
            <path d="M14 40h20" stroke="#B98A5E" strokeWidth={2.6} strokeLinecap="round" />
          </g>
        ) : icon === 'sleep-mood' ? (
          <g>
            <g transform="translate(-14 0)">{moon}</g>
            <ellipse cx={24} cy={25} rx={3} ry={6} fill="#B7A6E8" opacity={0.6} filter={`url(#${id}-soft)`} />
            {smile}
          </g>
        ) : (
          <g>
            {drop}
            <ellipse cx={24.5} cy={25} rx={2.6} ry={5.5} fill={icon === 'water-sleep' ? '#6C8FE0' : '#B9C98A'} opacity={0.65} filter={`url(#${id}-soft)`} />
            {icon === 'water-sleep' ? moon : smile}
          </g>
        )}
      </motion.g>
    </svg>
  )
}

const TILE: Record<HeadlineIcon, string> = {
  'water-sleep': 'from-tide-100 to-[#E6E9FB]',
  'sleep-mood': 'from-[#E6E9FB] to-sun-100',
  'water-mood': 'from-tide-100 to-sun-100',
  collecting: 'from-[#E2F1E3] to-mist',
}

/**
 * A vs B: the average outcome when the condition is met (e.g. water goal hit)
 * next to when it isn't. The better side is green; the other stays neutral.
 */
function Proof({ comparison }: { comparison: Comparison }) {
  const { groups, better, outcomeLabel } = comparison
  return (
    <div
      role="group"
      aria-label={`${outcomeLabel}: ${groups[0].label} ${groups[0].display}, ${groups[1].label} ${groups[1].display}`}
      className="relative mt-5 grid grid-cols-2 gap-3"
    >
      {groups.map((g, i) => {
        const good = i === better
        return (
          <motion.div
            key={g.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + i * 0.08, ease: 'easeOut' }}
            className={`rounded-2xl p-4 ring-1 ${good ? 'bg-emerald-50 ring-emerald-100' : 'bg-mist/70 ring-line'}`}
          >
            <p className={`text-xs font-bold sm:text-sm ${good ? 'text-emerald-700' : 'text-muted'}`}>{g.label}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{outcomeLabel}</p>
            {/* emerald-600, not -500: -500 is only 2.5:1 on white, below even the large-text minimum. */}
            <p className={`font-display text-2xl font-extrabold leading-tight sm:text-3xl ${good ? 'text-emerald-600' : 'text-ink/55'}`}>
              {g.display}
            </p>
            <p className="mt-1 text-xs text-muted">
              {g.days} {g.days === 1 ? 'day' : 'days'}
            </p>
          </motion.div>
        )
      })}
      <span
        className="pointer-events-none absolute left-1/2 top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[11px] font-extrabold text-muted shadow-sm ring-1 ring-line"
        aria-hidden
      >
        vs
      </span>
    </div>
  )
}

/**
 * The headline insight with its A-vs-B proof.
 * headline: undefined while loading, null if it couldn't load.
 */
export function InsightCard({ headline, error }: { headline?: Headline | null; error?: string | null }) {
  if (headline === undefined && !error) {
    return (
      <div className="animate-pulse rounded-3xl bg-white/70 p-5 ring-1 ring-line sm:p-6" aria-busy="true" aria-label="Loading your insight">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 shrink-0 rounded-2xl bg-mist" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded bg-mist" />
            <div className="h-5 w-full max-w-md rounded bg-mist" />
          </div>
        </div>
      </div>
    )
  }

  if (!headline) {
    return (
      <p role="status" className="rounded-3xl bg-white/60 px-5 py-4 text-sm text-muted ring-1 ring-line">
        Your insight couldn’t load right now. {error}
      </p>
    )
  }

  // Not enough overlapping days: a gentle prompt instead of a half-formed claim.
  if (headline.kind === 'collecting') {
    return (
      <motion.section
        aria-labelledby="insight-title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 rounded-3xl bg-gradient-to-br from-white to-[#F1F8F1] p-5 ring-1 ring-line sm:gap-5 sm:p-6"
      >
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${TILE.collecting}`}>
          <IconPair icon="collecting" />
        </div>
        <div className="min-w-0">
          <h2 id="insight-title" className="font-display text-base font-extrabold leading-snug sm:text-xl">
            Keep logging to unlock this insight
          </h2>
          <p className="mt-1 text-sm text-muted">{headline.text}</p>
        </div>
      </motion.section>
    )
  }

  const finding = headline.kind === 'finding'
  return (
    <motion.section
      aria-labelledby="insight-title"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="rounded-3xl bg-gradient-to-br from-white to-tide-50 p-5 ring-1 ring-line sm:p-6"
    >
      <div className="flex items-center gap-4 sm:gap-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${TILE[headline.icon]}`}>
          <IconPair icon={headline.icon} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{finding ? 'Your insight' : 'Insights'}</p>
          <h2 id="insight-title" className={`mt-1 font-display font-extrabold leading-snug ${finding ? 'text-lg sm:text-2xl' : 'text-base sm:text-xl'}`}>
            {headline.text}
          </h2>
          <p className="mt-1 text-sm text-muted">{headline.detail}</p>
        </div>
      </div>
      {headline.comparison && <Proof comparison={headline.comparison} />}
    </motion.section>
  )
}
