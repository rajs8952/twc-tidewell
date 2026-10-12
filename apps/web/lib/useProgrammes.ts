'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { errorMessage } from '@rajs8952/core/errors'
import { PROGRAMME_BY_ID, type Enrolment } from '@/lib/content/programmes'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------
 * The signed-in person's programme progress (supabase/programmes.sql),
 * read and written from the browser; row-level security keeps it to
 * their own rows. `ready === false` means the table isn't there yet.
 * ------------------------------------------------------------------ */

const COLUMNS = 'programme_id, started_at, completed_days, finished_at'

export function useProgrammes() {
  const supabase = useMemo(() => createClient(), [])
  const [enrolments, setEnrolments] = useState<Record<string, Enrolment> | null>(null)
  const [ready, setReady] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('programme_progress')
      .select(COLUMNS)
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) {
          if (e.code === 'PGRST205' || e.code === '42P01') setReady(false)
          else setError(e.message)
          setEnrolments({})
          return
        }
        setEnrolments(Object.fromEntries(((data ?? []) as Enrolment[]).map((r) => [r.programme_id, r])))
      })
    return () => {
      alive = false
    }
  }, [supabase])

  const save = useCallback(
    async (row: Enrolment) => {
      setError(null)
      const before = enrolments
      setEnrolments((m) => ({ ...(m ?? {}), [row.programme_id]: row }))
      const { error: e } = await supabase.from('programme_progress').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id,programme_id' })
      if (e) {
        setEnrolments(before)
        setError(errorMessage(e))
        return false
      }
      return true
    },
    [supabase, enrolments],
  )

  /** Start (or start again from day 1). */
  const start = useCallback(
    (id: string) => save({ programme_id: id, started_at: new Date().toISOString(), completed_days: [], finished_at: null }),
    [save],
  )

  /** Mark a day done or not done. */
  const setDay = useCallback(
    (id: string, day: number, done: boolean) => {
      const e = enrolments?.[id]
      const p = PROGRAMME_BY_ID[id]
      if (!e || !p) return Promise.resolve(false)
      const days = new Set(e.completed_days)
      if (done) days.add(day)
      else days.delete(day)
      const completed_days = [...days].sort((a, b) => a - b)
      const finished = completed_days.length >= p.days.length
      return save({ ...e, completed_days, finished_at: finished ? (e.finished_at ?? new Date().toISOString()) : null })
    },
    [enrolments, save],
  )

  /** Leave a programme (progress is removed). */
  const leave = useCallback(
    async (id: string) => {
      const before = enrolments
      setEnrolments((m) => {
        const next = { ...(m ?? {}) }
        delete next[id]
        return next
      })
      const { error: e } = await supabase.from('programme_progress').delete().eq('programme_id', id)
      if (e) {
        setEnrolments(before)
        setError(errorMessage(e))
      }
    },
    [supabase, enrolments],
  )

  return { enrolments, ready, error, start, setDay, leave }
}
