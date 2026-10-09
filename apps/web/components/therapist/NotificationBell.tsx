'use client'

import { Bell, CheckCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadNotifications, markNotificationsRead, type InAppNotification } from '@/lib/notifications-data'
import { createClient } from '@/lib/supabase/client'
import { usePolling } from '@/lib/usePolling'

/** How often the bell checks for new alerts while the tab is visible. */
const POLL_MS = 30_000

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/**
 * The coach's alerts: a bell with the unread count, opening a list.
 * Choosing an alert marks it read and opens that conversation in the portal.
 * Hidden until supabase/coach-alerts.sql has been run.
 */
export function NotificationBell({ portalPath }: { portalPath: string }) {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const [items, setItems] = useState<InAppNotification[] | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => setItems(await loadNotifications(supabase)), [supabase])
  useEffect(() => {
    refresh()
  }, [refresh])
  usePolling(refresh, POLL_MS)

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (items === null) return null
  const unread = items.filter((n) => !n.is_read)

  async function markRead(ids: string[]) {
    setItems((list) => list?.map((n) => (ids.includes(n.id) ? { ...n, is_read: true } : n)) ?? list)
    await markNotificationsRead(supabase, ids)
  }

  function choose(n: InAppNotification) {
    setOpen(false)
    if (!n.is_read) markRead([n.id])
    if (n.thread_id) router.push(`${portalPath}?thread=${n.thread_id}`)
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread.length ? `Alerts, ${unread.length} unread` : 'Alerts'}
        className="relative rounded-full p-2.5 text-ink ring-1 ring-line transition hover:bg-mist"
      >
        <Bell className="h-5 w-5" aria-hidden />
        {unread.length > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C42B1C] px-1 text-[11px] font-bold tabular-nums text-white ring-2 ring-white">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/5">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-extrabold">Alerts</h2>
            {unread.length > 0 && (
              <button type="button" onClick={() => markRead(unread.map((n) => n.id))} className="inline-flex items-center gap-1 text-xs font-bold text-tide-600 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">No alerts yet. New queries routed to you or added to your team’s pool show up here.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => choose(n)} className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-mist ${n.is_read ? '' : 'bg-tide-50/60'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-[#C42B1C]'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.is_read ? 'text-muted' : 'font-semibold text-ink'}`}>
                        {n.message}
                        {!n.is_read && <span className="sr-only"> (unread)</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{ago(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
