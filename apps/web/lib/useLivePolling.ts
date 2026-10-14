'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef } from 'react'

/* ------------------------------------------------------------------
 * Live updates for the open conversation.
 *
 * Supabase Realtime (supabase/chat-realtime.sql) tells us the moment a
 * message arrives or the thread changes (status, read receipts); we then
 * run `poll` straight away. The event is only a nudge: `poll` re-reads
 * through the normal queries, so row-level security decides what's seen,
 * exactly as before. Realtime itself also applies the same policies.
 *
 * While Realtime is connected, `poll` also runs once a minute as a safety
 * net. If it can't connect (SQL not run yet, network blocks WebSockets),
 * it falls back to adaptive polling:
 *   active in the last 2 min   → every 3 s
 *   active in the last 10 min  → every 10 s
 *   otherwise                  → every 30 s
 * Paused while the tab is hidden. When it's shown again it checks at once,
 * unless Realtime is connected and nothing changed meanwhile.
 * Call `bump()` on activity (a new message, typing, sending).
 * ------------------------------------------------------------------ */

const FAST_MS = 3_000
const MEDIUM_MS = 10_000
const SLOW_MS = 30_000
/** With Realtime connected: just a safety net for a missed event. */
const SAFETY_MS = 60_000

function delayFor(idleMs: number) {
  if (idleMs < 2 * 60_000) return FAST_MS
  if (idleMs < 10 * 60_000) return MEDIUM_MS
  return SLOW_MS
}

export function useLivePolling(poll: () => Promise<unknown> | unknown, enabled: boolean, live: { supabase: SupabaseClient; threadId: string | null }) {
  const latest = useRef(poll)
  latest.current = poll
  const lastActivity = useRef(Date.now())
  const { supabase, threadId } = live

  const bump = useCallback(() => {
    lastActivity.current = Date.now()
  }, [])

  useEffect(() => {
    if (!enabled) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let running = false
    let again = false // something changed while a check was running: check once more after it
    let connected = false
    let missed = false // a change arrived while the tab was hidden
    let lastCheck = Date.now()

    const visible = () => document.visibilityState === 'visible'
    const schedule = () => {
      clearTimeout(timer)
      if (stopped || !visible()) return
      timer = setTimeout(tick, connected ? SAFETY_MS : delayFor(Date.now() - lastActivity.current))
    }
    const tick = async () => {
      if (stopped) return
      if (running) {
        again = true
        return
      }
      running = true
      missed = false
      lastCheck = Date.now()
      clearTimeout(timer)
      try {
        await latest.current()
      } catch {
        // A failed check is retried on the next tick.
      } finally {
        running = false
        if (again && !stopped) {
          again = false
          tick()
        } else {
          schedule()
        }
      }
    }
    const onVisible = () => {
      if (!visible()) return clearTimeout(timer)
      // Back to the tab: treat it as activity, and check now if anything may have been missed.
      lastActivity.current = Date.now()
      if (!connected || missed || Date.now() - lastCheck >= SAFETY_MS) tick()
      else schedule()
    }

    // Realtime: any change to this conversation triggers a check now.
    const changed = () => {
      if (visible()) tick()
      else missed = true // checked when the tab is shown again
    }
    // Live only once the channel has joined AND the database side has confirmed
    // (the join succeeds even when Realtime isn't enabled for the tables; that
    // arrives afterwards as a postgres_changes system message).
    let joined = false
    let confirmed = false
    const update = () => {
      const was = connected
      connected = joined && confirmed
      if (stopped || was === connected) return
      // Just connected: catch up on anything from before. Just dropped: back to polling.
      if (connected) tick()
      else schedule()
    }
    const channel = threadId
      ? supabase
          .channel(`chat-${threadId}-${Math.random().toString(36).slice(2)}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'thread_messages', filter: `thread_id=eq.${threadId}` }, changed)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'therapist_threads', filter: `id=eq.${threadId}` }, changed)
          .on('system', {}, (m: { extension?: string; status?: string }) => {
            if (m.extension !== 'postgres_changes') return
            confirmed = m.status === 'ok'
            update()
          })
          .subscribe((status) => {
            joined = status === 'SUBSCRIBED'
            if (!joined) confirmed = false // a rejoin is confirmed again
            update()
          })
      : null

    lastActivity.current = Date.now()
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [enabled, supabase, threadId])

  return { bump }
}
