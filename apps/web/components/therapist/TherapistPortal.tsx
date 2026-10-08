'use client'

import { CheckCheck, Clock, Inbox, Lock, LockOpen, Loader2, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatAvatar,
  ChatFilters,
  ChatFrame,
  ChatHeader,
  ChatIconButton,
  ChatListHeader,
  ChatListItem,
  ChatNotice,
  ChatPlaceholder,
  ChatSearch,
  Composer,
  MessageList,
  initialsOf,
  timeLabel,
  type ChatMessageView,
} from '@/components/chat/ChatUI'
import { errorMessage } from '@rajs8952/core/errors'
import { loadQueue, loadStaffMessages, mergeMessages, myUserId, pollStaffThread, sendStaffReply, setChatStatus } from '@/lib/chat-data'
import { MAX_MESSAGE_LENGTH, REPLY_TARGET_HOURS, TEAMS, validateMessage, type QueueItem, type StaffThreadMessage, type Team } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { usePolling } from '@/lib/usePolling'
import { useLivePolling } from '@/lib/useLivePolling'

/* ------------------------------------------------------------------
 * Wellness-team portal (therapists or dietitians), laid out like
 * WhatsApp Web: the team's queue of employee conversations on the left,
 * the open conversation on the right. Row-level security only ever
 * returns the signed-in staff member's own team. No WebSockets: the
 * queue refreshes every 15 s and the open chat every few seconds while
 * active (lib/useLivePolling.ts); data goes straight to Supabase
 * (lib/chat-data.ts).
 * ------------------------------------------------------------------ */

const QUEUE_POLL_MS = 15_000
type Filter = 'waiting' | 'open' | 'closed'

/** Avatar colours for employees' initials; all give white text 4.5:1 or more. */
const AVATAR_COLORS = ['#6A55C9', '#1A6DB5', '#237A70', '#A85A0B', '#4A5BC4', '#B4345C']
function colorFor(id: string) {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000
function waitLabel(iso: string) {
  const h = hoursSince(iso)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.floor(h)} h`
  return `${Math.floor(h / 24)} days`
}
function listTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeLabel(iso)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** Where a conversation stands, in words plus colour (never colour alone). */
function StatusBadge({ item }: { item: QueueItem }) {
  if (item.status === 'closed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#54656F]">
        <Lock className="h-3 w-3" aria-hidden /> Closed
      </span>
    )
  }
  if (item.waiting_since) {
    const overdue = hoursSince(item.waiting_since) >= REPLY_TARGET_HOURS
    return (
      <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${overdue ? 'bg-[#C42B1C]' : 'bg-[#008069]'}`}>
        <Clock className="h-3 w-3" aria-hidden />
        {overdue ? 'Overdue ' : ''}
        {waitLabel(item.waiting_since)}
      </span>
    )
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-[#0A5C4A]">
      <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Replied
    </span>
  )
}

interface Pending {
  key: string
  threadId: string
  content: string
  createdAt: string
  state: 'sending' | 'failed'
  error?: string
}

export function TherapistPortal({ team }: { team: Team }) {
  const supabase = useMemo(() => createClient(), [])
  const label = TEAMS[team].label
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('waiting')
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<StaffThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [me, setMe] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const activeRef = useRef<string | null>(null)
  activeRef.current = activeId

  const item = queue?.find((q) => q.thread_id === activeId) ?? null

  /* ----- queue ----- */

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await loadQueue(supabase))
      setQueueError(null)
    } catch (e) {
      setQueueError(errorMessage(e))
    }
  }, [supabase])

  useEffect(() => {
    myUserId(supabase).then(setMe)
    trackProgress(refreshQueue())
  }, [supabase, refreshQueue])
  usePolling(refreshQueue, QUEUE_POLL_MS)

  /* ----- open conversation ----- */

  useEffect(() => {
    setMessages([])
    setNotice(null)
    setDraft('')
    if (!activeId) return
    const id = activeId
    setLoadingThread(true)
    trackProgress(loadStaffMessages(supabase, id))
      .then((list) => {
        if (activeRef.current === id) setMessages((cur) => mergeMessages(list, cur))
      })
      .catch((e) => setNotice(errorMessage(e)))
      .finally(() => setLoadingThread(false))
  }, [activeId, supabase])

  /** Updates the open conversation's row in the queue without reloading it all. */
  const patchItem = useCallback((id: string, patch: Partial<QueueItem>) => setQueue((q) => q?.map((x) => (x.thread_id === id ? { ...x, ...patch } : x)) ?? q), [])

  const { bump } = useLivePolling(async () => {
    const id = activeRef.current
    if (!id) return
    const newest = messages[messages.length - 1]?.created_at ?? null
    const { messages: fresh, status } = await pollStaffThread(supabase, id, newest)
    if (activeRef.current !== id) return
    const known = new Set(messages.map((m) => m.id))
    const added = fresh.filter((m) => !known.has(m.id))
    if (added.length) {
      setMessages((cur) => mergeMessages(cur, fresh))
      const last = added[added.length - 1]!
      patchItem(id, {
        last_message: last.content.slice(0, 160),
        last_message_at: last.created_at,
        last_sender_role: last.sender_role,
        waiting_since: last.sender_role === 'user' ? (item?.waiting_since ?? last.created_at) : null,
      })
      const fromEmployee = added.filter((m) => m.sender_role === 'user').length
      if (fromEmployee) {
        bump()
        setAnnouncement(`${fromEmployee} new message${fromEmployee > 1 ? 's' : ''} from ${item?.user_name ?? 'the employee'}.`)
      }
    }
    if (status && item && status !== item.status) patchItem(id, { status })
  }, activeId !== null)

  /* ----- actions ----- */

  async function deliver(p: Pending) {
    setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'sending', error: undefined } : x)))
    try {
      const saved = await sendStaffReply(supabase, p.threadId, p.content)
      setPending((ps) => ps.filter((x) => x.key !== p.key))
      if (activeRef.current === p.threadId) setMessages((cur) => mergeMessages(cur, [saved]))
      patchItem(p.threadId, { waiting_since: null, last_sender_role: 'therapist', last_message: saved.content.slice(0, 160), last_message_at: saved.created_at })
      bump()
    } catch (e) {
      setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'failed', error: errorMessage(e) } : x)))
    }
  }

  function send() {
    if (!activeId) return
    const parsed = validateMessage(draft)
    if (!parsed.ok) return setNotice(parsed.error)
    setNotice(null)
    const p: Pending = { key: `p-${Date.now()}`, threadId: activeId, content: parsed.value, createdAt: new Date().toISOString(), state: 'sending' }
    setPending((ps) => [...ps, p])
    setDraft('')
    deliver(p)
  }

  async function toggleStatus() {
    if (!item) return
    const next = item.status === 'open' ? 'closed' : 'open'
    if (next === 'closed' && !window.confirm(`Close this conversation with ${item.user_name}? They can still read it and can start a new one.`)) return
    setStatusBusy(true)
    try {
      patchItem(item.thread_id, { status: await setChatStatus(supabase, item.thread_id, next) })
    } catch (e) {
      setNotice(errorMessage(e))
    } finally {
      setStatusBusy(false)
    }
  }

  /* ----- view ----- */

  const counts = {
    waiting: queue?.filter((q) => q.status === 'open' && q.waiting_since).length ?? 0,
    open: queue?.filter((q) => q.status === 'open').length ?? 0,
    closed: queue?.filter((q) => q.status === 'closed').length ?? 0,
  }
  const q = query.trim().toLowerCase()
  const shown = (queue ?? []).filter((x) => {
    const inFilter = filter === 'closed' ? x.status === 'closed' : x.status === 'open' && (filter === 'open' || x.waiting_since)
    return inFilter && (!q || x.user_name.toLowerCase().includes(q) || (x.user_email ?? '').toLowerCase().includes(q) || (x.last_message ?? '').toLowerCase().includes(q))
  })

  const colleague = `Another ${label.toLowerCase()}`
  const views: ChatMessageView[] = [
    ...messages.map((m) => {
      const mine = m.sender_role === 'therapist'
      return { id: m.id, mine, content: m.content, createdAt: m.created_at, state: 'sent' as const, author: mine && m.sender_id && me && m.sender_id !== me ? colleague : undefined }
    }),
    ...pending.filter((p) => p.threadId === activeId).map((p) => ({ id: p.key, mine: true, content: p.content, createdAt: p.createdAt, state: p.state, error: p.error, onRetry: () => deliver(p) })),
  ]

  const sidebar = (
    <>
      <ChatListHeader
        title={`${label} inbox`}
        actions={
          <ChatIconButton label="Refresh" onClick={() => trackProgress(refreshQueue())}>
            <RotateCw className="h-5 w-5" aria-hidden />
          </ChatIconButton>
        }
      />
      <ChatSearch value={query} onChange={setQuery} placeholder="Search name, email or message" />
      <ChatFilters<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'waiting', label: 'Waiting', count: counts.waiting },
          { id: 'open', label: 'All open', count: counts.open },
          { id: 'closed', label: 'Closed', count: counts.closed },
        ]}
      />
      {queueError && <p role="alert" className="mx-3 mb-2 rounded-lg bg-[#FDECEA] px-3 py-2 text-sm font-semibold text-[#8C1D13]">{queueError}</p>}
      <ul className="flex-1 overflow-y-auto" aria-label={`${label} conversations`}>
        {queue === null ? (
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-3">
              <span className="h-12 w-12 rounded-full bg-[#F0F2F5] motion-safe:animate-pulse" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-28 rounded bg-[#F0F2F5] motion-safe:animate-pulse" />
                <span className="block h-3 w-44 rounded bg-[#F0F2F5] motion-safe:animate-pulse" />
              </span>
            </li>
          ))
        ) : shown.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-[#54656F]">
            {q ? 'No conversations match your search.' : filter === 'waiting' ? 'Nobody is waiting for a reply.' : 'No conversations here.'}
          </li>
        ) : (
          shown.map((x) => (
            <ChatListItem
              key={x.thread_id}
              active={x.thread_id === activeId}
              onClick={() => setActiveId(x.thread_id)}
              avatar={<ChatAvatar color={colorFor(x.user_id)} initials={initialsOf(x.user_name)} />}
              title={x.user_name}
              time={x.last_message_at ? listTime(x.last_message_at) : undefined}
              preview={x.last_message ? `${x.last_sender_role === 'therapist' ? 'You: ' : ''}${x.last_message}` : 'No messages yet'}
              badge={<StatusBadge item={x} />}
            />
          ))
        )}
      </ul>
    </>
  )

  const open = item?.status === 'open'
  const main = !activeId ? (
    <ChatPlaceholder icon={Inbox} title={`${label} inbox`}>
      Choose a conversation on the left. The longest-waiting are at the top of <strong>Waiting</strong>. Reply target: {REPLY_TARGET_HOURS} business hours.
    </ChatPlaceholder>
  ) : (
    <>
      <ChatHeader
        onBack={() => setActiveId(null)}
        avatar={item ? <ChatAvatar color={colorFor(item.user_id)} initials={initialsOf(item.user_name)} size="sm" /> : <ChatAvatar color="#54656F" initials="?" size="sm" />}
        title={item?.user_name ?? 'Conversation'}
        subtitle={item ? `${item.user_email ?? ''}${item.user_email ? ' · ' : ''}${open ? (item.waiting_since ? `waiting ${waitLabel(item.waiting_since)}` : 'replied') : 'closed'}` : undefined}
        actions={
          item && (
            <button
              type="button"
              onClick={toggleStatus}
              disabled={statusBusy}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#3B4A54] transition hover:bg-black/5 disabled:opacity-50"
            >
              {statusBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : open ? <Lock className="h-4 w-4" aria-hidden /> : <LockOpen className="h-4 w-4" aria-hidden />}
              {open ? 'Close' : 'Reopen'}
            </button>
          )
        }
      />
      <MessageList
        messages={views}
        loading={loadingThread}
        notice={<ChatNotice>Only the {label.toLowerCase()} team can see this conversation. Refer anyone in crisis to the EAP hotline or emergency services (112).</ChatNotice>}
        empty={<p className="mt-8 text-center text-sm text-[#54656F]">No messages yet.</p>}
      />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {notice && (
        <p role="alert" className="shrink-0 bg-[#FDECEA] px-4 py-2 text-sm font-semibold text-[#8C1D13]">
          {notice}
        </p>
      )}
      {item && !open ? (
        <div className="shrink-0 px-4 py-3 text-center text-sm text-[#54656F]" style={{ background: '#F0F2F5' }}>
          This conversation is closed. Reopen it to reply.
        </div>
      ) : (
        <Composer value={draft} onChange={(v) => { setDraft(v); bump() }} onSend={send} placeholder={`Reply to ${item?.user_name ?? 'employee'}`} maxLength={MAX_MESSAGE_LENGTH} disabled={!item} />
      )}
    </>
  )

  return <ChatFrame sidebar={sidebar} main={main} showMain={activeId !== null} className="h-[calc(100dvh-7.5rem)] min-h-[480px] sm:h-[calc(100dvh-9rem)]" />
}
