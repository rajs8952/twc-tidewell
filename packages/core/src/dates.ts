/* Calendar math shared by every tracker. Dates are always in the user's local time. */

export function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Monday-start week. */
export function startOfWeek(d: Date): Date {
  const s = startOfDay(d)
  const offset = (s.getDay() + 6) % 7
  return addDays(s, -offset)
}

/* ---------- Streaks ---------- */

export interface Streaks {
  current: number
  best: number
  todayMet: boolean
}

/**
 * Current streak counts consecutive goal days ending today — or ending
 * yesterday if today isn't finished yet, so the streak doesn't "break"
 * at breakfast.
 */
export function computeStreaks(totals: Record<string, number>, goal: number, today = new Date()): Streaks {
  const met = (k: string) => (totals[k] ?? 0) >= goal
  const todayKey = dayKey(today)

  let current = 0
  let cursor = startOfDay(today)
  if (!met(todayKey)) cursor = addDays(cursor, -1)
  while (met(dayKey(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }

  let best = 0
  let run = 0
  let prev: string | null = null
  for (const k of Object.keys(totals).filter(met).sort()) {
    run = prev && dayKey(addDays(parseDayKey(prev), 1)) === k ? run + 1 : 1
    best = Math.max(best, run)
    prev = k
  }

  return { current, best: Math.max(best, current), todayMet: met(todayKey) }
}

/* ---------- Greeting ---------- */

export function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
