'use client'

import { motion, useReducedMotion } from 'framer-motion'

/** Circular daily-completion ring; the track is a pale tint of the tracker's colour. */
export function CompletionRing({ progress, color, size = 76 }: { progress: number | null; color: string; size?: number }) {
  const reduce = useReducedMotion()
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = progress ?? 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.14} strokeWidth={stroke} />
      {progress !== null && p > 0 && (
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: 'easeOut' }}
        />
      )}
    </svg>
  )
}
