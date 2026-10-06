'use client'

import { Loader2, Lock, MessageCircleHeart, PenSquare, Phone, RotateCw, Send } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { getMyThreads, getThreadMessages, sendMessage, startThread } from '@/app/actions/messages'
import { errorMessage } from '@/lib/errors'
import { MAX_MESSAGE_LENGTH, TEAMS, validateMessage, type Team, type TherapistThread, type ThreadMessage } from '@/lib/messages'
import { usePolling } from '@/lib/usePolling'
import { WELLNESS_BY_ID, telHref } from '@/lib/wellness-team'
import { Bubble } from './Bubble'
import { trackProgress } from '@/lib/progress'

/* ------------------------------------------------------------------
 * Secure inbox for talking to a therapist or dietitian (one inbox per team;
 * each team only sees its own conversations). Asynchronous by design: no
 * WebSockets or Supabase Realtime. Messages load on mount and are polled
 * every 30 seconds while the tab is visible (lib/usePolling.ts).
 * ------------------------------------------------------------------ */

const POLL_MS = 30_000

/** A message the user sent that the server hasn't confirmed yet. */
interface Pending {
  key: string
  content: string
  status: 'sending' | 'failed'
  error?: string
}

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}
const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const threadLabel = (t: TherapistThread) =>
  `Started ${new Date(t.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${t.status === 'open' ? 'Open' : 'Closed'}`

export function Disclaimer({ team }: { team: Team }) {
  const phone = WELLNESS_BY_ID.eap.phone
  return (
    <div role="note" className="flex gap-3 rounded-2xl bg-[#FFF6E5] p-4 text-sm text-ink ring-1 ring-[#F2D49B]">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#8A5A00]" aria-hidden />
      <p>
        This is a secure asynchronous inbox. A {TEAMS[team].label.toLowerCase()} will reply within 24 business hours.{' '}
        <strong className="font-bold">
          If you are in crisis, call the EAP hotline immediately at{' '}
          {phone ? (
            <a href={telHref(phone)} className="whitespace-nowrap underline underline-offset-2">
              {phone}
            </a>
          ) : (
            'your local emergency number'
          )}
          .
        </strong>
      </p>
    </div>
  )
}

export function SecureInbox({ team }: { team: Team }) {
  const info = TEAMS[team]
  const [threads, setThreads] = useState<TherapistThread[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [pending, setPending] = useState<Pending[]>([])
  const [composingNew, setComposingNew] = useState(false)
  const [draft, setDraft] = useState('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const seenIds = useRef(new Set<string>())
  const draftId = useId()

  const active = threads?.find((t) => t.id === activeId) ?? null
  const canWrite = composingNew || !active || active.status === 'open'

  // First load: the newest open conversation, else the newest one, else a blank composer.
  useEffect(() => {
    trackProgress(getMyThreads(team))
      .then((res) => {
        if (!res.ok) return setLoadError(res.error)
        setThreads(res.data)
        const first = res.data.find((t) => t.status === 'open') ?? res.data[0]
        if (first) setActiveId(first.id)
        else setComposingNew(true)
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }, [team])

  /** Loads (or refreshes) the active thread. Announces new staff replies to screen readers. */
  const refresh = useCallback(
    async (opts: { initial?: boolean } = {}) => {
      if (!activeId) return
      if (opts.initial) setLoadingThread(true)
      try {
        const res = await (opts.initial ? trackProgress(getThreadMessages(activeId)) : getThreadMessages(activeId))
        if (!res.ok) return opts.initial ? setLoadError(res.error) : undefined
        setLoadError(null)
        setThreads((ts) => ts?.map((t) => (t.id === res.data.thread.id ? res.data.thread : t)) ?? ts)
        const fresh = res.data.messages.filter((m) => !seenIds.current.has(m.id) && m.sender_role === 'therapist')
        if (!opts.initial && fresh.length) {
          setAnnouncement(fresh.length === 1 ? `New reply from your ${info.label.toLowerCase()}.` : `${fresh.length} new replies from your ${info.label.toLowerCase()}.`)
        }
        seenIds.current = new Set(res.data.messages.map((m) => m.id))
        setMessages(res.data.messages)
      } catch {
        // A failed poll is retried on the next tick; keep what's on screen.
      } finally {
        if (opts.initial) setLoadingThread(false)
      }
    },
    [activeId, info.label],
  )

  useEffect(() => {
    setMessages([])
    setPending([])
    seenIds.current = new Set()
    stickToBottom.current = true
    if (activeId) refresh({ initial: true })
  }, [activeId, refresh])

  usePolling(() => refresh(), POLL_MS, Boolean(activeId) && !composingNew)

  // Keep the newest message in view unless the user has scrolled up to read.
  useEffect(() => {
    const el = listRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [messages, pending])

  function onScroll() {
    const el = listRef.current
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  async function deliver(item: Pending) {
    setPending((p) => p.map((x) => (x.key === item.key ? { ...x, status: 'sending', error: undefined } : x)))
    const drop = () => setPending((p) => p.filter((x) => x.key !== item.key))
    const fail = (error: string) => setPending((p) => p.map((x) => (x.key === item.key ? { ...x, status: 'failed', error } : x)))

    try {
      if (composingNew || !activeId) {
        const res = await startThread(item.content, team)
        if (res.ok) {
          setThreads((ts) => [res.data.thread, ...(ts ?? [])])
          setComposingNew(false)
          setActiveId(res.data.thread.id) // loads the new thread, including this first message
          return
        }
        if ('thread' in res) {
          // The conversation opened but the message didn't save: retry into that thread.
          setThreads((ts) => [res.thread, ...(ts ?? [])])
          setComposingNew(false)
          setActiveId(res.thread.id)
          setDraft(item.content)
          setSendError(`Your message wasn’t sent: ${res.error} It’s back in the box below; try again.`)
          return drop()
        }
        return fail(res.error)
      }
      const res = await sendMessage(item.content, activeId)
      if (!res.ok) return fail(res.error)
      drop()
      seenIds.current.add(res.data.id)
      setMessages((m) => (m.some((x) => x.id === res.data.id) ? m : [...m, res.data]))
    } catch (e) {
      fail(errorMessage(e, 'Couldn’t reach the server. Check your connection.'))
    }
  }

  function onSubmit(e?: FormEvent) {
    e?.preventDefault()
    setSendError(null)
    const parsed = validateMessage(draft)
    if (!parsed.ok) return setSendError(parsed.error)
    const item: Pending = { key: `p-${Date.now()}`, content: parsed.value, status: 'sending' }
    setPending((p) => [...p, item])
    setDraft('')
    stickToBottom.current = true
    deliver(item)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter adds a new line (these are letters, not chat); Ctrl/⌘ + Enter sends.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit()
  }

  function newConversation() {
    setComposingNew(true)
    setActiveId(null)
    setMessages([])
    setPending([])
    setSendError(null)
  }

  if (loadError && threads === null) {
    return (
      <div className="space-y-4">
        <Disclaimer team={team} />
        <p role="alert" className="notice-error">{loadError}</p>
      </div>
    )
  }

  const sending = pending.some((p) => p.status === 'sending')
  const remaining = MAX_MESSAGE_LENGTH - draft.trim().length
  // Day separators between messages.
  let lastDay = ''

  return (
    <div className="space-y-4">
      <Disclaimer team={team} />

      <section aria-label="Conversation" className="flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-line">
        {/* Conversation picker and "new" */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          {threads && threads.length > 0 && !composingNew ? (
            <label className="flex min-w-0 items-center gap-2 text-sm">
              <span className="font-bold">Conversation</span>
              <select
                value={activeId ?? ''}
                onChange={(e) => setActiveId(e.target.value)}
                className="min-w-0 rounded-xl border border-line bg-white px-2 py-1.5 text-sm font-semibold text-ink"
              >
                {threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {threadLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm font-bold">{threads === null ? 'Loading…' : 'New conversation'}</p>
          )}
          {threads && threads.length > 0 && !composingNew && (
            <button type="button" onClick={newConversation} className="btn-secondary px-3.5 py-2 text-xs">
              <PenSquare className="h-3.5 w-3.5" aria-hidden /> New conversation
            </button>
          )}
          {composingNew && threads && threads.length > 0 && (
            <button type="button" onClick={() => { setComposingNew(false); setActiveId(threads[0].id) }} className="text-sm font-bold text-muted underline-offset-2 hover:text-ink hover:underline">
              Back to conversations
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={listRef} onScroll={onScroll} className="h-[min(56vh,520px)] min-h-[280px] overflow-y-auto bg-mist/40 px-3 py-4 sm:px-5" aria-busy={loadingThread}>
          {threads === null || loadingThread ? (
            <div className="space-y-3" aria-label="Loading messages">
              <div className="ml-auto h-12 w-2/3 animate-pulse rounded-3xl bg-white/80" />
              <div className="h-16 w-3/4 animate-pulse rounded-3xl bg-white/80" />
            </div>
          ) : messages.length === 0 && pending.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `${info.accent}26`, color: info.accent }}>
                <MessageCircleHeart className="h-6 w-6" aria-hidden />
              </span>
              <p className="mt-3 font-display text-lg font-extrabold">Write to a {info.label.toLowerCase()}</p>
              <p className="mt-1 max-w-sm text-sm text-muted">
                {info.intro}
              </p>
            </div>
          ) : (
            <ol className="space-y-3">
              {messages.map((m) => {
                const day = dayLabel(m.created_at)
                const separator = day !== lastDay
                lastDay = day
                return (
                  <li key={m.id}>
                    {separator && <p className="my-3 text-center text-xs font-bold text-muted">{day}</p>}
                    <Bubble side={m.sender_role === 'user' ? 'mine' : 'theirs'} label={m.sender_role === 'user' ? 'You' : info.label} accent={info.accent} meta={<time dateTime={m.created_at}>{timeLabel(m.created_at)}</time>}>
                      {m.content}
                    </Bubble>
                  </li>
                )
              })}
              {pending.map((p) => (
                <li key={p.key}>
                    <Bubble
                      side="mine"
                      label="You"
                      meta={
                        p.status === 'sending' ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Sending…
                          </span>
                        ) : (
                          <span className="inline-flex flex-wrap items-center justify-end gap-x-2 font-semibold text-alert" role="alert">
                            Not sent{p.error ? `: ${p.error}` : ''}
                            <button type="button" onClick={() => deliver(p)} className="inline-flex items-center gap-1 underline underline-offset-2">
                              <RotateCw className="h-3 w-3" aria-hidden /> Retry
                            </button>
                          </span>
                        )
                      }
                    >
                      {p.content}
                    </Bubble>
                </li>
              ))}
            </ol>
          )}
        </div>
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>

        {/* Composer, or a closed-thread notice */}
        {canWrite ? (
          <form onSubmit={onSubmit} className="border-t border-line p-3 sm:p-4">
            <label htmlFor={draftId} className="sr-only">
              Your message
            </label>
            <textarea
              id={draftId}
              rows={3}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setSendError(null)
              }}
              onKeyDown={onKeyDown}
              maxLength={MAX_MESSAGE_LENGTH + 200}
              placeholder="Write your message…"
              disabled={threads === null}
              className="input min-h-[88px] resize-y"
            />
            {sendError && (
              <p role="alert" className="notice-error mt-2">
                {sendError}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {remaining < 300 ? (
                  <span className={remaining < 0 ? 'font-bold text-alert' : ''}>{remaining.toLocaleString()} characters left</span>
                ) : (
                  <span className="hidden sm:inline">Press Ctrl + Enter to send</span>
                )}
              </p>
              <button type="submit" disabled={threads === null || !draft.trim() || remaining < 0 || sending} className="btn-primary px-5 py-2.5">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                Send
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted">This conversation has been closed. You can still read it.</p>
            <button type="button" onClick={newConversation} className="btn-primary shrink-0 px-4 py-2.5">
              <PenSquare className="h-4 w-4" aria-hidden /> Start a new conversation
            </button>
          </div>
        )}
      </section>

      {WELLNESS_BY_ID.eap.phone && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Phone className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Prefer to talk? Call the EAP on{' '}
            <a href={telHref(WELLNESS_BY_ID.eap.phone)} className="font-bold text-ink underline underline-offset-2">
              {WELLNESS_BY_ID.eap.phone}
            </a>
            .
          </span>
        </p>
      )}
    </div>
  )
}
