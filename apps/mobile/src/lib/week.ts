import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
import type { BarDay } from '@/components/WeekBars'

/**
 * This week (Monday to Sunday) as one bar per day, from a tracker's entries:
 * `at` is the entry's day (local), `value` what it adds, and `combine` how a
 * day's values become its bar (sum by default; mood uses the average).
 */
export function thisWeek<T>(entries: T[], at: (e: T) => string, value: (e: T) => number, now = new Date(), combine: (values: number[]) => number = (v) => v.reduce((s, x) => s + x, 0)): BarDay[] {
  const start = startOfWeek(now)
  const todayKey = dayKey(now)
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    const k = dayKey(d)
    const values = entries.filter((e) => dayKey(new Date(at(e))) === k).map(value)
    return { key: k, label: d.toLocaleDateString([], { weekday: 'short' }), value: values.length ? combine(values) : 0, isToday: k === todayKey, isFuture: d > now }
  })
}

/** "7h 30m", "45 min". */
export const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, '0')}m` : `${Math.round(min)} min`)
