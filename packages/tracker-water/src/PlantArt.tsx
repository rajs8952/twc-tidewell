'use client'

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useId } from 'react'
import { BUD_AT, SPECIES, SPROUT_AT, type Mood, type Species, type SpeciesId } from '@omniwell/core/garden'

const BASE_X = 100
const SOIL_Y = 178
const DRY_LEAF = '#A8975A'

/** Blends two #rrggbb colours; t = 0 → a, 1 → b. */
function mix(a: string, b: string, t: number) {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16)
  const c = [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t))
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

function Flower({ s, open }: { s: Species; open: boolean }) {
  if (!open) {
    return (
      <g>
        <path
          d="M0 -14C7 -10 7 -2 0 2C-7 -2 -7 -10 0 -14Z"
          fill={mix(s.petal, s.leaf, 0.3)}
          stroke={mix(s.leaf, '#000000', 0.15)}
          strokeWidth={1}
        />
        <path d="M-5 0Q0 6 5 0" fill={s.leaf} />
      </g>
    )
  }
  switch (s.id) {
    case 'sunflower':
      return (
        <g>
          {Array.from({ length: 14 }).map((_, i) => (
            <ellipse key={i} cx={0} cy={-15} rx={4.6} ry={9} fill={s.petal} transform={`rotate(${(i * 360) / 14})`} />
          ))}
          <circle r={10} fill={s.center} />
          <circle r={6} fill={mix(s.center, '#000000', 0.25)} opacity={0.5} />
        </g>
      )
    case 'daisy':
      return (
        <g>
          {Array.from({ length: 12 }).map((_, i) => (
            <ellipse key={i} cx={0} cy={-11} rx={3.2} ry={8} fill={s.petal} stroke="#DCE3E2" strokeWidth={0.8} transform={`rotate(${i * 30})`} />
          ))}
          <circle r={5.5} fill={s.center} />
        </g>
      )
    case 'tulip':
      return (
        <g transform="translate(0 4)">
          <path d="M-11 -14C-12 -2 -6 4 0 4C6 4 12 -2 11 -14L5 -8L0 -18L-5 -8Z" fill={s.petal} />
          <path d="M-5 -8L0 -18L5 -8C3 0 -3 0 -5 -8Z" fill={s.center} opacity={0.55} />
        </g>
      )
    case 'bluebell':
      return (
        <g>
          {[-13, 0, 13].map((x, i) => (
            <g key={x} transform={`translate(${x} ${i === 1 ? -6 : 2})`}>
              <path d={`M0 -6Q${-x * 0.3} -10 ${-x * 0.6} -12`} stroke={SPECIES.bluebell.leaf} strokeWidth={1.6} fill="none" />
              <path d="M-6 0C-6 -8 6 -8 6 0L8 5H-8Z" fill={s.petal} />
              <path d="M-8 5H8" stroke={s.center} strokeWidth={1.6} strokeLinecap="round" />
            </g>
          ))}
        </g>
      )
  }
}

function PotFace({ mood }: { mood: Mood }) {
  const mouth = {
    thriving: 'M-7 2Q0 10 7 2',
    happy: 'M-6 3Q0 8 6 3',
    thirsty: 'M-5 5H5',
    wilting: 'M-6 7Q0 1 6 7',
  }[mood]
  const eyeY = mood === 'wilting' ? -1 : -3
  return (
    <g transform={`translate(${BASE_X} 206)`} stroke="#3A2416" strokeWidth={2.4} strokeLinecap="round" fill="none">
      {mood === 'thriving' ? (
        <>
          <path d="M-14 -3Q-11 -7 -8 -3" />
          <path d="M8 -3Q11 -7 14 -3" />
        </>
      ) : (
        <>
          <circle cx={-11} cy={eyeY} r={1.6} fill="#3A2416" stroke="none" />
          <circle cx={11} cy={eyeY} r={1.6} fill="#3A2416" stroke="none" />
        </>
      )}
      <path d={mouth} />
      {(mood === 'thriving' || mood === 'happy') && (
        <>
          <circle cx={-18} cy={4} r={3} fill="#F29A8E" stroke="none" opacity={0.6} />
          <circle cx={18} cy={4} r={3} fill="#F29A8E" stroke="none" opacity={0.6} />
        </>
      )}
      {mood === 'wilting' && <path d="M17 -10q2 4 0 6q-2 -2 0 -6Z" fill="#7FCBF0" stroke="none" />}
    </g>
  )
}

interface Props {
  species: SpeciesId
  /** 0–1 growth toward bloom; 1 renders the open flower. */
  fraction: number
  droop?: number
  mood?: Mood
  /** Changes on each watering to play the falling-drops animation. */
  waterKey?: number
  /** Decorative thumbnail for the garden shelf: no face, no motion. */
  mini?: boolean
  className?: string
}

export function PlantArt({ species, fraction, droop = 0, mood = 'happy', waterKey = 0, mini = false, className }: Props) {
  const reduce = useReducedMotion() || mini
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const s = SPECIES[species]
  const f = Math.min(Math.max(fraction, 0), 1)
  const d = Math.min(Math.max(droop, 0), 1)
  const leafColor = mix(s.leaf, DRY_LEAF, d * 0.7)
  const stemColor = mix(mix(s.leaf, '#000000', 0.1), DRY_LEAF, d * 0.6)

  const seedOnly = f < SPROUT_AT
  const height = 18 + f * 100
  const topX = BASE_X + d * 22
  const topY = SOIL_Y - height + d * 14
  const ctrlX = BASE_X + d * 34
  const ctrlY = SOIL_Y - height * 0.55
  const stemPath = `M${BASE_X} ${SOIL_Y}Q${ctrlX} ${ctrlY} ${topX} ${topY}`

  const leafCount = seedOnly ? 0 : Math.max(2, Math.min(6, Math.floor(f * 7)))
  // Point on the quadratic stem at t, for placing leaves.
  const at = (t: number) => ({
    x: (1 - t) ** 2 * BASE_X + 2 * (1 - t) * t * ctrlX + t ** 2 * topX,
    y: (1 - t) ** 2 * SOIL_Y + 2 * (1 - t) * t * ctrlY + t ** 2 * topY,
  })

  const sway = reduce
    ? {}
    : {
        animate: { rotate: [-1.6, 1.6, -1.6] },
        transition: { duration: 5 + d * 3, ease: 'easeInOut' as const, repeat: Infinity },
      }

  return (
    <svg viewBox="0 0 200 240" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-pot`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={mix(s.pot, '#FFFFFF', 0.12)} />
          <stop offset="1" stopColor={mix(s.pot, '#000000', 0.12)} />
        </linearGradient>
      </defs>

      {!mini && (
        <g aria-hidden>
          {/* sky: the sun dims as the plant gets thirsty */}
          <circle cx={40} cy={42} r={24} fill="#FDE7A8" opacity={0.35 * (1 - d * 0.6)} />
          <circle cx={40} cy={42} r={14} fill="#F9D27A" opacity={0.9 - d * 0.5} />
          {[
            { x: 128, y: 34, s: 1, dur: 14 },
            { x: 150, y: 86, s: 0.7, dur: 18 },
          ].map((c) => (
            <motion.path
              key={c.x}
              d="M0 0a8 8 0 0 1 15 -4a10 10 0 0 1 19 3a7 7 0 0 1 1 13H2a6 6 0 0 1 -2 -12Z"
              fill="#FFFFFF"
              opacity={0.9}
              transform={`translate(${c.x} ${c.y}) scale(${c.s})`}
              {...(reduce ? {} : { animate: { x: [0, -10, 0] }, transition: { duration: c.dur, ease: 'easeInOut', repeat: Infinity } })}
            />
          ))}
          <ellipse cx={BASE_X} cy={234} rx={52} ry={5} fill="#0F2F37" opacity={0.08} />
        </g>
      )}

      <motion.g style={{ transformBox: 'view-box', transformOrigin: `${BASE_X}px ${SOIL_Y}px` }} {...sway}>
        {seedOnly ? (
          <g>
            <ellipse cx={BASE_X} cy={SOIL_Y - 3} rx={7} ry={5} fill="#8A5A3B" />
            {f > SPROUT_AT / 3 && (
              <motion.path
                d={`M${BASE_X} ${SOIL_Y - 6}q2 -10 9 -12q-1 7 -9 12`}
                fill={leafColor}
                initial={reduce ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'bottom left' }}
              />
            )}
          </g>
        ) : (
          <>
            <path d={stemPath} stroke={stemColor} strokeWidth={4 + f * 2} strokeLinecap="round" fill="none" />
            {Array.from({ length: leafCount }).map((_, i) => {
              const t = 0.25 + (i / Math.max(leafCount, 1)) * 0.62
              const p = at(t)
              const side = i % 2 === 0 ? 1 : -1
              const size = 0.7 + (1 - t) * 0.6 + f * 0.25
              const angle = side * (-38 + d * 52)
              return (
                <path
                  key={i}
                  d="M0 0C8 -10 26 -12 34 -2C24 6 8 6 0 0Z"
                  fill={leafColor}
                  transform={`translate(${p.x} ${p.y}) scale(${side * size} ${size}) rotate(${side * angle})`}
                />
              )
            })}
            {f >= BUD_AT && (
              <g transform={`translate(${topX} ${topY}) rotate(${d * 35}) scale(${f >= 1 ? 1.6 : 1.1})`}>
                <Flower s={s} open={f >= 1} />
              </g>
            )}
          </>
        )}
      </motion.g>

      {/* pot */}
      <path d="M58 186H142L132 234H68Z" fill={`url(#${id}-pot)`} />
      <rect x={52} y={172} width={96} height={16} rx={5} fill={mix(s.pot, '#000000', 0.06)} />
      <ellipse cx={BASE_X} cy={176} rx={42} ry={3.5} fill="#5B3A26" />
      {!mini && <PotFace mood={mood} />}

      <AnimatePresence>
        {waterKey > 0 && !reduce && (
          <g key={waterKey}>
            {[-18, -6, 6, 18, -12, 12].map((x, i) => (
              <motion.path
                key={i}
                d="M0 -6C3 -2 4 1 4 3a4 4 0 0 1 -8 0c0 -2 1 -5 4 -9Z"
                fill="#46ACE6"
                initial={{ x: BASE_X + x, y: 10, opacity: 0 }}
                animate={{ y: SOIL_Y - 6, opacity: [0, 1, 1, 0] }}
                transition={{ duration: 0.9, delay: i * 0.08, ease: 'easeIn' }}
              />
            ))}
          </g>
        )}
      </AnimatePresence>
    </svg>
  )
}
