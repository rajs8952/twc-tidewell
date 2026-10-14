import { PROGRAMME_BY_ID, type Enrolment } from '@omniwell/web/content/programmes'
import { useFocusEffect } from 'expo-router'
import { useCallback, useState } from 'react'
import { supabase } from './supabase'
import { messageOf } from './trackers'

/* ------------------------------------------------------------------
 * The signed-in person's programme progress (supabase/programmes.sql),
 * the same rows the website reads and writes (apps/web/lib/useProgrammes.ts).
 * Row-level security keeps it to their own; the database also only lets
 * Free accounts take part in the free programme.
 * ------------------------------------------------------------------ */

export const NOT_ADVICE = 'General wellbeing guidance, not medical advice. If you have a health condition, check with your doctor first.'

const COLUMNS = 'programme_id, started_at, completed_days, finished_at'

export function useProgrammes() {
  const [enrolments, setEnrolments] = useState<Record<string, Enrolment> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      supabase
        .from('programme_progress')
        .select(COLUMNS)
        .then(({ data, error: e }) => {
          if (!alive) return
          if (e) setError(messageOf(e))
          setEnrolments(Object.fromEntries(((data ?? []) as Enrolment[]).map((r) => [r.programme_id, r])))
        })
      return () => {
        alive = false
      }
    }, []),
  )

  async function save(row: Enrolment) {
    setError(null)
    const before = enrolments
    setEnrolments((m) => ({ ...(m ?? {}), [row.programme_id]: row }))
    const { error: e } = await supabase.from('programme_progress').upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'user_id,programme_id' })
    if (e) {
      setEnrolments(before)
      setError(/premium/i.test(e.message) ? 'This programme is part of Premium.' : messageOf(e))
      return false
    }
    return true
  }

  /** Start (or start again from day 1). */
  const start = (id: string) => save({ programme_id: id, started_at: new Date().toISOString(), completed_days: [], finished_at: null })

  /** Mark a day done or not done. */
  function setDay(id: string, day: number, done: boolean) {
    const e = enrolments?.[id]
    const p = PROGRAMME_BY_ID[id]
    if (!e || !p) return Promise.resolve(false)
    const days = new Set(e.completed_days)
    if (done) days.add(day)
    else days.delete(day)
    const completed_days = [...days].sort((a, b) => a - b)
    const finished = completed_days.length >= p.days.length
    return save({ ...e, completed_days, finished_at: finished ? (e.finished_at ?? new Date().toISOString()) : null })
  }

  /** Leave a programme (its progress is removed). */
  async function leave(id: string) {
    const before = enrolments
    setEnrolments((m) => {
      const next = { ...(m ?? {}) }
      delete next[id]
      return next
    })
    const { error: e } = await supabase.from('programme_progress').delete().eq('programme_id', id)
    if (e) {
      setEnrolments(before)
      setError(messageOf(e))
    }
  }

  return { enrolments, error, start, setDay, leave }
}

/** A website path used in programme and tip links, as the app's screen. */
export function appHref(webPath: string) {
  if (webPath.startsWith('/messages')) return '/chats'
  if (webPath.startsWith('/water')) return '/water'
  return webPath // /exercise, /meditation, /mood, /sleep, /profile exist in the app too
}
