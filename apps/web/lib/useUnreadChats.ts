'use client'

import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from './supabase/client'
import { usePolling } from './usePolling'

/** How often the Chats badge checks for replies while the app is visible. */
const POLL_MS = 60_000

/**
 * How many of the employee's conversations have a reply they haven't read:
 * the coach's latest message is newer than when they last read that chat
 * (read receipts, supabase/chat-receipts-and-scoping.sql), so it's the same
 * on every device. Checks every minute while the app is visible and on every
 * page change. 0 until it knows, or if chats aren't set up.
 */
export function useUnreadChats() {
  const supabase = useMemo(() => createClient(), [])
  const pathname = usePathname()
  const [count, setCount] = useState(0)

  const check = useCallback(async () => {
    const [previews, threads] = await Promise.all([
      supabase.rpc('my_chat_previews'),
      supabase.from('therapist_threads').select('id, user_read_at'),
    ])
    if (previews.error || threads.error) return
    const readAt = new Map((threads.data as { id: string; user_read_at: string | null }[]).map((t) => [t.id, t.user_read_at]))
    const unread = (previews.data as { thread_id: string; sender_role: string; created_at: string }[]).filter((m) => {
      if (m.sender_role !== 'therapist') return false
      const read = readAt.get(m.thread_id)
      return !read || Date.parse(m.created_at) > Date.parse(read)
    })
    setCount(unread.length)
  }, [supabase])

  useEffect(() => {
    check()
  }, [check, pathname])
  usePolling(check, POLL_MS)
  return count
}
