import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * Supabase Realtime, as on the website (apps/web/lib/useRealtime.ts):
 * calls `onChange` when rows the signed-in person can see change
 * (Realtime applies the same row-level security as queries). Returns
 * whether it's live, so screens poll slowly while it is and faster
 * while it isn't. Events are only nudges: screens re-read normally.
 * ------------------------------------------------------------------ */

export type Change = RealtimePostgresChangesPayload<Record<string, unknown>>

export interface Watch {
  table: string
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
}

export function useRealtime(watches: Watch[] | null, onChange: (change: Change) => void): boolean {
  const latest = useRef(onChange)
  useEffect(() => {
    latest.current = onChange
  })
  const [live, setLive] = useState(false)
  const key = watches ? JSON.stringify(watches) : null

  useEffect(() => {
    if (!key) return
    let joined = false
    let confirmed = false
    // Live once the channel has joined AND the database confirmed (joining succeeds even when a table isn't enabled).
    const update = () => setLive(joined && confirmed)
    let channel = supabase.channel(`live-${Math.random().toString(36).slice(2)}`)
    for (const w of JSON.parse(key) as Watch[]) {
      channel = channel.on('postgres_changes', { event: w.event, schema: 'public', table: w.table, ...(w.filter ? { filter: w.filter } : {}) } as never, (c: Change) => latest.current(c))
    }
    channel
      .on('system', {}, (m: { extension?: string; status?: string }) => {
        if (m.extension !== 'postgres_changes') return
        confirmed = m.status === 'ok'
        update()
      })
      .subscribe((status) => {
        joined = status === 'SUBSCRIBED'
        if (!joined) confirmed = false
        update()
      })
    return () => {
      setLive(false)
      supabase.removeChannel(channel)
    }
  }, [key])

  return live
}

/** The new row of an insert or update (empty for a delete). */
export const newRow = (c: Change) => (c.eventType === 'DELETE' ? {} : c.new) as Record<string, unknown>
