import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from './supabase'
import { newRow, useRealtime } from './useRealtime'

/** Conversations with a coach reply the employee hasn't read (the Chats tab badge). Fired by the chat screen after reading. */
const listeners = new Set<() => void>()
export const recountUnread = () => listeners.forEach((l) => l())

const WATCHES = [{ table: 'thread_messages', event: 'INSERT' as const }]

/**
 * The same count as the website's Chats badge (apps/web/lib/useUnreadChats.ts):
 * the coach's latest message is newer than when the employee last read it.
 * Recounts when a coach replies (Realtime), after reading, and when the app
 * comes back to the foreground; polls every minute only if Realtime is down.
 */
export function useUnread() {
  const [count, setCount] = useState(0)
  const mine = useRef<Set<string>>(new Set())

  const check = useCallback(async () => {
    const [previews, threads] = await Promise.all([supabase.rpc('my_chat_previews'), supabase.from('therapist_threads').select('id, user_read_at')])
    if (previews.error || threads.error) return
    const readAt = new Map((threads.data as { id: string; user_read_at: string | null }[]).map((t) => [t.id, t.user_read_at]))
    const latest = previews.data as { thread_id: string; sender_role: string; created_at: string }[]
    mine.current = new Set(latest.map((m) => m.thread_id))
    setCount(
      latest.filter((m) => {
        if (m.sender_role !== 'therapist') return false
        const read = readAt.get(m.thread_id)
        return !read || Date.parse(m.created_at) > Date.parse(read)
      }).length,
    )
  }, [])

  const live = useRealtime(WATCHES, (c) => {
    const row = newRow(c)
    if (row.sender_role === 'therapist' && mine.current.has(row.thread_id as string)) void check()
  })

  useEffect(() => {
    // The first count, once mounted (it arrives asynchronously, like the rest).
    const first = setTimeout(() => void check(), 0)
    listeners.add(check)
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void check())
    const timer = setInterval(() => AppState.currentState === 'active' && void check(), live ? 300_000 : 60_000)
    return () => {
      clearTimeout(first)
      listeners.delete(check)
      sub.remove()
      clearInterval(timer)
    }
  }, [check, live])

  return count
}
