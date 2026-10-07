'use client'

import { ArrowLeft, CheckCircle2, Clock, Inbox, Loader2, Lock, LockOpen, RotateCw, Send } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { getConversation, getQueue, replyToThread, setThreadStatus } from '@/app/actions/therapist'
import { Bubble } from '@/components/messages/Bubble'
import { errorMessage } from '@rajs8952/core/errors'
import { MAX_MESSAGE_LENGTH, REPLY_TARGET_HOURS, TEAMS, validateMessage, type QueueItem, type StaffThreadMessage, type Team } from '@/lib/messages'
import { usePolling } from '@/lib/usePolling'
import { trackProgress } from '@/lib/progress'

/* ------------------------------------------------------------------
 * Wellness-team portal (therapists or dietitians): a shared queue of the
 * team's employee conversations and a reply view. The database only ever
 * returns the signed-in staff member's own team. Asynchronous like the employee inbox: polled every 30 seconds,
 * no WebSockets. Server actions: app/actions/therapist.ts.
 * ------------------------------------------------------------------ */

const POLL_MS = 30_000
type Filter = 'waiting' | 'open' | 'closed'

const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000

function waitLabel(iso: string) {
  const h = hoursSince(iso)
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.floor(h)} h`
  return `${Math.floor(h / 24)} days`
}

const shortTime = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const fullTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

/** Where a conversation stands, as words plus a colour (never colour alone). */
function StatusChip({ item }: { item: QueueItem }) {
  if (item.status === 'closed') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[11px] font-bold text-muted"><Lock className="h-3 w-3" aria-hidden />Closed</span>
  }
  if (item.waiting_since) {
    const overdue = hoursSince(item.waiting_since) >= REPLY_TARGET_HOURS
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${overdue ? 'bg-alert/10 text-alert' : 'bg-[#FFF1D6] text-[#8A5A00]'}`}>
        <Clock className="h-3 w-3" aria-hidden />
        {overdue ? 'Overdue · ' : 'Waiting '}
        {waitLabel(item.waiting_since)}
      </span>
    )
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700"><CheckCircle2 className="h-3 w-3" aria-hidden />Replied</span>
}

export function TherapistPortal({ team }: { team: Team }) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('waiting')
  const [activeId, setActiveId] = useState<string | null>(null)

  const loadQueue = useCallback(async () => {
    try {
      const res = await getQueue()
      if (res.ok) {
        setQueue(res.data)
        setQueueError(null)
      } else setQueueError(res.error)
    } catch (e) {
      setQueueError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    trackProgress(loadQueue())
  }, [loadQueue])
  usePolling(loadQueue, POLL_MS)

  const counts = {
    waiting: queue?.filter((q) => q.status === 'open' && q.waiting_since).length ?? 0,
    open: queue?.filter((q) => q.status === 'open').length ?? 0,
    closed: queue?.filter((q) => q.status === 'closed').length ?? 0,
  }
  const shown =
    queue?.filter((q) => (filter === 'closed' ? q.status === 'closed' : q.status === 'open' && (filter === 'open' || q.waiting_since))) ?? []

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* Queue: hidden on phones while a conversation is open */}
      <section aria-labelledby="queue-title" className={`${activeId ? 'hidden lg:block' : ''}`}>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h1 id="queue-title" className="text-2xl font-extrabold">{TEAMS[team].label} inbox</h1>
            <p className="text-sm text-muted">Reply target: {REPLY_TARGET_HOURS} business hours.</p>
          </div>
          <button type="button" onClick={loadQueue} className="rounded-full p-2 text-muted hover:bg-mist hover:text-ink" aria-label="Refresh inbox">
            <RotateCw className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div role="tablist" aria-label="Filter conversations" className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-mist p-1">
          {(
            [
              ['waiting', 'Waiting'],
              ['open', 'All open'],
              ['closed', 'Closed'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              onClick={() => setFilter(id)}
              className={`rounded-xl px-2 py-1.5 text-sm font-bold transition ${filter === id ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
            >
              {label} <span className="tabular-nums">({counts[id]})</span>
            </button>
          ))}
        </div>

        {queueError && <p role="alert" className="notice-error mb-3">{queueError}</p>}

        {queue === null && !queueError ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading inbox">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-2xl bg-white p-6 text-center ring-1 ring-line">
            <Inbox className="mx-auto h-6 w-6 text-muted" aria-hidden />
            <p className="mt-2 text-sm font-bold">{filter === 'waiting' ? 'Nobody is waiting for a reply.' : 'No conversations here.'}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {shown.map((q) => {
              const active = q.thread_id === activeId
              return (
                <li key={q.thread_id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(q.thread_id)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full rounded-2xl p-3.5 text-left ring-1 transition ${active ? 'bg-white ring-2 ring-[#7C6BD6]' : 'bg-white ring-line hover:ring-ink/20'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block truncate font-bold">{q.user_name}</span>
                        {q.user_email && <span className="block truncate text-xs text-muted">{q.user_email}</span>}
                      </span>
                      {q.last_message_at && <span className="shrink-0 text-xs text-muted">{shortTime(q.last_message_at)}</span>}
                    </div>
                    {q.last_message && (
                      <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">
                        {q.last_sender_role === 'therapist' && <span className="font-semibold text-muted">You: </span>}
                        {q.last_message}
                      </p>
                    )}
                    <div className="mt-2">
                      <StatusChip item={q} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* Conversation */}
      <section aria-label="Conversation" className={activeId ? '' : 'hidden lg:block'}>
        {activeId ? (
          <Conversation key={activeId} threadId={activeId} team={team} onBack={() => setActiveId(null)} onChanged={loadQueue} />
        ) : (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-white p-8 text-center ring-1 ring-line">
            <Inbox className="h-8 w-8 text-muted" aria-hidden />
            <p className="mt-3 font-bold">Choose a conversation</p>
            <p className="mt-1 text-sm text-muted">The longest-waiting ones are at the top.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function Conversation({ threadId, team, onBack, onChanged }: { threadId: string; team: Team; onBack: () => void; onChanged: () => void }) {
  const colleague = `Another ${TEAMS[team].label.toLowerCase()}`
  const [item, setItem] = useState<QueueItem | null>(null)
  const [messages, setMessages] = useState<StaffThreadMessage[]>([])
  const [me, setMe] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const draftId = useId()

  const load = useCallback(async () => {
    try {
      const res = await getConversation(threadId)
      if (!res.ok) return setLoadError(res.error)
      setLoadError(null)
      setItem(res.data.item)
      setMessages(res.data.messages)
      setMe(res.data.me)
    } catch {
      // Retried on the next poll.
    }
  }, [threadId])

  useEffect(() => {
    load()
  }, [load])
  usePolling(load, POLL_MS)

  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages])

  async function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    setSendError(null)
    const parsed = validateMessage(draft)
    if (!parsed.ok) return setSendError(parsed.error)
    setSending(true)
    try {
      const res = await replyToThread(threadId, parsed.value)
      if (!res.ok) return setSendError(res.error)
      setDraft('')
      stickToBottom.current = true
      setMessages((m) => [...m, res.data])
      setItem((i) => (i ? { ...i, waiting_since: null, last_sender_role: 'therapist' } : i))
      onChanged()
    } catch (err) {
      setSendError(errorMessage(err, 'Couldn’t reach the server. Your reply is still in the box; try again.'))
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
  }

  async function toggleStatus() {
    if (!item) return
    const next = item.status === 'open' ? 'closed' : 'open'
    if (next === 'closed' && !window.confirm(`Close this conversation with ${item.user_name}? They can still read it and can start a new one.`)) return
    setStatusBusy(true)
    const res = await setThreadStatus(threadId, next)
    setStatusBusy(false)
    if (!res.ok) return setSendError(res.error)
    setItem({ ...item, status: res.data })
    onChanged()
  }

  if (loadError && !item) return <p role="alert" className="notice-error">{loadError}</p>
  if (!item) return <div className="h-[520px] animate-pulse rounded-3xl bg-white/70" aria-busy="true" aria-label="Loading conversation" />

  const remaining = MAX_MESSAGE_LENGTH - draft.trim().length
  const open = item.status === 'open'

  return (
    <div className="flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <button type="button" onClick={onBack} className="-ml-1 rounded-full p-2 text-muted hover:bg-mist hover:text-ink lg:hidden" aria-label="Back to inbox">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold leading-tight">{item.user_name}</h2>
          <p className="truncate text-xs text-muted">
            {item.user_email ? `${item.user_email} · ` : ''}Started {fullTime(item.created_at)}
          </p>
        </div>
        <StatusChip item={item} />
        <button type="button" onClick={toggleStatus} disabled={statusBusy} className="btn-secondary px-3.5 py-2 text-xs">
          {statusBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : open ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <LockOpen className="h-3.5 w-3.5" aria-hidden />}
          {open ? 'Close' : 'Reopen'}
        </button>
      </div>

      <div
        ref={listRef}
        onScroll={() => {
          const el = listRef.current
          if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
        className="h-[min(60vh,560px)] min-h-[280px] overflow-y-auto bg-mist/40 px-3 py-4 sm:px-5"
      >
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {messages.map((m) => {
              const mine = m.sender_role === 'therapist'
              const label = m.sender_role === 'user' ? item.user_name : m.sender_id === me ? 'You' : colleague
              return (
                <li key={m.id}>
                  {/* Staff replies sit on the right; a colleague's reply is labelled. */}
                  <Bubble side={mine ? 'mine' : 'theirs'} label={label} meta={<time dateTime={m.created_at}>{(mine && m.sender_id !== me ? `${colleague} · ` : '') + fullTime(m.created_at)}</time>}>
                    {m.content}
                  </Bubble>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="border-t border-line p-3 sm:p-4">
          <label htmlFor={draftId} className="sr-only">
            Reply to {item.user_name}
          </label>
          <textarea
            id={draftId}
            rows={4}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setSendError(null)
            }}
            onKeyDown={onKeyDown}
            placeholder={`Reply to ${item.user_name}…`}
            className="input min-h-[104px] resize-y"
          />
          {sendError && <p role="alert" className="notice-error mt-2">{sendError}</p>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted">
              {remaining < 300 ? <span className={remaining < 0 ? 'font-bold text-alert' : ''}>{remaining.toLocaleString()} characters left</span> : <span className="hidden sm:inline">Ctrl + Enter to send</span>}
            </p>
            <button type="submit" disabled={sending || !draft.trim() || remaining < 0} className="btn-primary px-5 py-2.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              Send reply
            </button>
          </div>
        </form>
      ) : (
        <div className="border-t border-line p-4">
          {sendError && <p role="alert" className="notice-error mb-2">{sendError}</p>}
          <p className="text-sm text-muted">This conversation is closed. Reopen it to reply.</p>
        </div>
      )}
    </div>
  )
}
