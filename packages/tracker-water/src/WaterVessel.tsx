'use client'

import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { useEffect, useId } from 'react'

const H = 320
const TOP = 10
const VESSEL_PATH = 'M48 4H152Q196 4 196 48V252Q196 316 132 316H68Q4 316 4 252V48Q4 4 48 4Z'

/** One period = 200 units; path is 400 wide so a -200 shift loops seamlessly. */
function wavePath(amp: number, base: number) {
  return `M0 ${base} Q50 ${base - amp} 100 ${base} T200 ${base} T300 ${base} T400 ${base} V${H + 60} H0 Z`
}

const BUBBLES = [
  { x: 46, r: 3, d: 5.5, delay: 0 },
  { x: 88, r: 2, d: 4.2, delay: 1.4 },
  { x: 132, r: 3.5, d: 6.4, delay: 2.1 },
  { x: 160, r: 2, d: 4.8, delay: 3.3 },
  { x: 70, r: 2.5, d: 5.8, delay: 4 },
]

const BURST_COLORS = ['#46ACE6', '#F2AE2E', '#7FCBF0', '#2189D6']

interface Props {
  current: number
  goal: number
  splashKey?: number
  celebrate?: boolean
}

export function WaterVessel({ current, goal, splashKey = 0, celebrate = false }: Props) {
  const reduce = useReducedMotion()
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const ratio = goal > 0 ? current / goal : 0
  const fill = Math.min(Math.max(ratio, 0), 1)
  const pct = Math.round(ratio * 100)
  const levelY = fill === 0 ? H + 12 : TOP + (H - TOP) * (1 - fill)

  const count = useSpring(0, { stiffness: 90, damping: 22 })
  useEffect(() => {
    count.set(current)
  }, [count, current])
  const countText = useTransform(count, (v) => Math.round(v).toLocaleString())

  const level = {
    initial: { y: H + 12 },
    animate: { y: levelY },
    transition: reduce
      ? { duration: 0.3 }
      : { type: 'spring' as const, stiffness: 45, damping: 13, mass: 1.1 },
  }

  const drift = (duration: number, reverse = false) =>
    reduce
      ? {}
      : {
          animate: { x: reverse ? [-200, 0] : [0, -200] },
          transition: { duration, ease: 'linear' as const, repeat: Infinity },
        }

  const readout = (color: string) => (
    <g fill={color} textAnchor="middle" style={{ fontFamily: 'var(--font-display), system-ui, sans-serif' }}>
      <motion.text x={100} y={150} fontSize={46} fontWeight={700} letterSpacing={-1.5}>
        {countText}
      </motion.text>
      <text x={100} y={176} fontSize={13} fontWeight={600} opacity={0.72}>
        of {goal.toLocaleString()} ml
      </text>
      <text x={100} y={210} fontSize={16} fontWeight={700}>
        {pct}%
      </text>
    </g>
  )

  return (
    <div className="relative mx-auto w-full max-w-[230px] sm:max-w-[260px]">
      <svg
        viewBox="-4 -4 208 328"
        className="block h-auto w-full overflow-visible drop-shadow-[0_24px_40px_rgba(24,86,144,0.18)]"
        role="img"
        aria-label={`${current.toLocaleString()} of ${goal.toLocaleString()} millilitres, ${pct}% of today's goal`}
      >
        <defs>
          <clipPath id={`${id}-vessel`}>
            <path d={VESSEL_PATH} />
          </clipPath>
          <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#46ACE6" />
            <stop offset="55%" stopColor="#2189D6" />
            <stop offset="100%" stopColor="#185690" />
          </linearGradient>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x={-10} y={-10} width={220} height={H + 30}>
            <motion.g {...level}>
              <motion.path d={wavePath(8, 0)} fill="#fff" {...drift(4.5)} />
            </motion.g>
          </mask>
          {/* Inverse of the water: keeps the dark readout legible right up to the waterline. */}
          <mask id={`${id}-above`} maskUnits="userSpaceOnUse" x={-10} y={-10} width={220} height={H + 30}>
            <rect x={-10} y={-10} width={220} height={H + 30} fill="#fff" />
            <motion.g {...level}>
              <motion.path d={wavePath(8, 0)} fill="#000" {...drift(4.5)} />
            </motion.g>
          </mask>
        </defs>

        {/* glass */}
        <path d={VESSEL_PATH} fill="#FFFFFF" fillOpacity={0.78} />

        <g clipPath={`url(#${id}-vessel)`}>
          <motion.g {...level}>
            <motion.path d={wavePath(6, -7)} fill="#B4E1F7" {...drift(7, true)} />
            <motion.path d={wavePath(8, 0)} fill={`url(#${id}-water)`} {...drift(4.5)} />
          </motion.g>

          <g mask={`url(#${id}-mask)`}>
            {!reduce &&
              BUBBLES.map((b, i) => (
                <motion.circle
                  key={i}
                  cx={b.x}
                  r={b.r}
                  fill="#fff"
                  initial={{ cy: H + 10, opacity: 0 }}
                  animate={{ cy: [H + 10, 30], opacity: [0, 0.7, 0] }}
                  transition={{ duration: b.d, delay: b.delay, repeat: Infinity, ease: 'easeIn' }}
                />
              ))}
            {readout('#FFFFFF')}
          </g>

          <AnimatePresence>
            {splashKey > 0 && !reduce && (
              <motion.ellipse
                key={splashKey}
                cx={100}
                cy={levelY}
                fill="none"
                stroke="#fff"
                strokeWidth={2}
                initial={{ rx: 8, ry: 2, opacity: 0.95 }}
                animate={{ rx: 100, ry: 10, opacity: 0 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </g>

        <g mask={`url(#${id}-above)`}>{readout('#0F2F37')}</g>

        {/* level marks */}
        {[0.25, 0.5, 0.75].map((p) => {
          const y = TOP + (H - TOP) * (1 - p)
          return (
            <line
              key={p}
              x1={178}
              x2={188}
              y1={y}
              y2={y}
              stroke="#0F2F37"
              strokeOpacity={0.22}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )
        })}
        <path d={VESSEL_PATH} fill="none" stroke="#C3D8D6" strokeWidth={3} />
        <rect x={18} y={34} width={7} height={112} rx={3.5} fill="#fff" opacity={0.65} />
      </svg>

      <AnimatePresence>
        {celebrate && (
          <motion.div
            className="pointer-events-none absolute inset-0"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            aria-hidden
          >
            {Array.from({ length: 14 }).map((_, i) => {
              const angle = (i / 14) * Math.PI * 2
              const dist = 110 + (i % 3) * 18
              return (
                <motion.span
                  key={i}
                  className="absolute left-1/2 top-[22%] h-2.5 w-2.5 -translate-x-1/2 rounded-full"
                  style={{ background: BURST_COLORS[i % BURST_COLORS.length] }}
                  initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
                  animate={{
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist,
                    scale: [0, 1.2, 0.6],
                    opacity: [1, 1, 0],
                  }}
                  transition={{ duration: 1.5, ease: 'easeOut' }}
                />
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
