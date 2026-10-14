'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CHATS_READ_EVENT } from './chat-data'
import { createClient } from './supabase/client'
import { usePolling } from './usePolling'
import { newRow, useRealtime, type Watch } from './useRealtime'

/** Without Realtime: how often the Chats badge checks for replies while the app is visible. */
const POLL_MS = 60_000
/** With Realtime: only a safety net for a missed event. */
const SAFETY_MS = 300_000
const WATCHES: Watch[] = [{ table: 'thread_messages', event: 'INSERT' }]

/**
 * How many of the employee's conversations have a reply they haven't read:
 * the coach's latest message is newer than when they last read that chat
 * (read receipts, supabase/chat-receipts-and-scoping.sql), so it's the same
 * on every device. Recounts when a coach replies (Realtime) and when they
 * read a conversation here, not on every page change. 0 until it knows, or
 * if chats aren't set up.
 */
export function useUnreadChats() {
  const supabase = useMemo(() => createClient(), [])
  const [count, setCount] = useState(0)
  /** The employee's own conversations (a coach's replies elsewhere don't concern this badge). */
  const mine = useRef<Set<string>>(new Set())

  const check = useCallback(async () => {
    const [previews, threads] = await Promise.all([
      supabase.rpc('my_chat_previews'),
      supabase.from('therapist_threads').select('id, user_read_at'),
    ])
    if (previews.error || threads.error) return
    const readAt = new Map((threads.data as { id: string; user_read_at: string | null }[]).map((t) => [t.id, t.user_read_at]))
    const latest = previews.data as { thread_id: string; sender_role: string; created_at: string }[]
    mine.current = new Set(latest.map((m) => m.thread_id))
    const unread = latest.filter((m) => {
      if (m.sender_role !== 'therapist') return false
      const read = readAt.get(m.thread_id)
      return !read || Date.parse(m.created_at) > Date.parse(read)
    })
    setCount(unread.length)
  }, [supabase])

  const countRef = useRef(count)
  countRef.current = count
  useEffect(() => {
    check()
    // Reading can only lower the count: nothing to recount at 0.
    const onRead = () => countRef.current > 0 && check()
    window.addEventListener(CHATS_READ_EVENT, onRead)
    return () => window.removeEventListener(CHATS_READ_EVENT, onRead)
  }, [check])

  const live = useRealtime(supabase, WATCHES, (c) => {
    const row = newRow(c)
    // A coach's reply in one of the employee's conversations (a brand-new conversation has none yet).
    if (row.sender_role === 'therapist' && mine.current.has(row.thread_id as string)) check()
  })
  usePolling(check, live ? SAFETY_MS : POLL_MS)
  return count
}
