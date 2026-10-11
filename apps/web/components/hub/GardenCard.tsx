'use client'

import { ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { MOOD_LABEL, SPECIES, computeGarden } from '@rajs8952/core/garden'
import { PlantArt } from '@rajs8952/tracker-water'

/**
 * The water garden's current plant on Home: it grows with every day the
 * water goal is met (the same garden as Water → Garden, which it links to).
 */
export function GardenCard({ totals, goal }: { totals: Record<string, number>; goal: number }) {
  const garden = useMemo(() => computeGarden(totals, goal), [totals, goal])
  const c = garden.current
  const name = SPECIES[c.species].name
  const bloomed = garden.grown.length

  return (
    <Link
      href="/water/garden"
      className="group flex items-center gap-4 rounded-3xl bg-gradient-to-br from-[#EAF6F1] to-white p-4 ring-1 ring-line transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-24px_rgba(15,47,55,0.45)]"
    >
      <div className="h-20 w-16 shrink-0" aria-hidden>
        <PlantArt species={c.species} fraction={c.fraction} droop={garden.droop} mood={garden.mood} mini className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wide text-[#0F7A6A]">Your garden</p>
        <p className="font-display text-lg font-extrabold leading-tight">
          {name} · {c.stage}
        </p>
        <p className="text-sm text-muted">
          {garden.daysToBloom > 0 ? `${garden.daysToBloom} water-goal ${garden.daysToBloom === 1 ? 'day' : 'days'} to bloom` : 'In bloom'} · {MOOD_LABEL[garden.mood].toLowerCase()}
          {bloomed > 0 && ` · ${bloomed} grown`}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}
