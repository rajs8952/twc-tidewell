'use client'

import { motion, useReducedMotion } from 'framer-motion'

const path = (base: number, amp: number) =>
  `M0 ${base} Q150 ${base - amp} 300 ${base} T600 ${base} T900 ${base} T1200 ${base} V400 H0 Z`

/** Slow decorative waves for the sign-in panel. */
export function AmbientWaves() {
  const reduce = useReducedMotion()
  const loop = (d: number, rev = false) =>
    reduce ? {} : { animate: { x: rev ? [-600, 0] : [0, -600] }, transition: { duration: d, repeat: Infinity, ease: 'linear' as const } }
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[55%] w-full" aria-hidden>
      <motion.path d={path(120, 26)} fill="#46ACE6" opacity={0.45} {...loop(22, true)} />
      <motion.path d={path(170, 20)} fill="#2189D6" opacity={0.7} {...loop(16)} />
      <motion.path d={path(230, 16)} fill="#185690" {...loop(12, true)} />
    </svg>
  )
}
