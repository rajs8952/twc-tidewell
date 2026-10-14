'use client'

import type { RealtimePostgresChangesPayload, SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------
 * Supabase Realtime: calls `onChange` when rows the signed-in person can
 * see change (Realtime applies the same row-level security as queries;
 * supabase/chat-realtime.sql lists the tables). Returns whether it's live,
 * so callers can poll slowly while it is and fall back to faster polling
 * while it isn't (SQL not run yet, or WebSockets blocked).
 *
 * Events are only nudges: callers re-read through their normal queries.
 * ------------------------------------------------------------------ */

export type Change = RealtimePostgresChangesPayload<Record<string, unknown>>

export interface Watch {
  table: string
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
  filter?: string
}

export function useRealtime(supabase: SupabaseClient, watches: Watch[] | null, onChange: (change: Change) => void): boolean {
  const latest = useRef(onChange)
  latest.current = onChange
  const [live, setLive] = useState(false)
  // Re-subscribe only when what's watched changes, not on every render.
  const key = watches ? JSON.stringify(watches) : null

  useEffect(() => {
    if (!key) return
    let joined = false
    let confirmed = false
    // Live only once the channel has joined AND the database confirmed: joining
    // succeeds even when a table isn't enabled for Realtime; that comes after.
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
  }, [supabase, key])

  return live
}

/** The new row of an insert or update (empty for a delete). */
export const newRow = (c: Change) => (c.eventType === 'DELETE' ? {} : c.new) as Record<string, unknown>
