'use client'

import { Apple, ChevronDown, Lock, MessageCircleHeart, MessageSquarePlus, PenSquare, ShieldAlert } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChatAvatar,
  ChatFrame,
  ChatHeader,
  ChatListHeader,
  ChatListItem,
  ChatPlaceholder,
  ChatSearch,
  ChatSystemNote,
  Composer,
  MessageList,
  receiptState,
  timeLabel,
  type ChatMessageView,
} from '@/components/chat/ChatUI'
import { uploadChatImage } from '@/app/actions/chat-media'
import { notifyCoachOfReply, submitUserQuery } from '@/app/actions/routing'
import { errorMessage } from '@rajs8952/core/errors'
import { ChatImageError, formatBytes, prepareChatImage } from '@/lib/chat-image'
import { storageKey } from '@/lib/brand'
import { listMyChats, loadMessages, markRead, mergeMessages, pollThread, sendUserMessage, type ChatSummary } from '@/lib/chat-data'
import { MAX_MESSAGE_LENGTH, PHOTO_PREVIEW, TEAMS, isOpenStatus, validateMessage, type Team, type ThreadMessage, type ThreadStatus } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { usePolling } from '@/lib/usePolling'
import { useLivePolling } from '@/lib/useLivePolling'
import { newRow, useRealtime, type Watch } from '@/lib/useRealtime'
import { useSignedImages } from '@/lib/useSignedImages'
import { useWellnessContacts } from '@/lib/useWellnessContacts'
import { telHref } from '@/lib/wellness-team'

/* ------------------------------------------------------------------
 * The employee's secure inbox ("Your care team"): one card per coach
 * they're talking to, with earlier conversations folded inside, past
 * conversations below, and the open conversation on the right. Asynchronous by design (no WebSockets
 * or Realtime): the open chat is polled every few seconds while active
 * (lib/useLivePolling.ts), and data goes straight to Supabase under
 * row-level security (lib/chat-data.ts).
 * ------------------------------------------------------------------ */

/** Avatar colours with white icons at 3:1 or more (the dietitian orange is a deeper step). */
const TEAM_LOOK: Record<Team, { color: string; icon: typeof Apple }> = {
  therapist: { color: '#6A55C9', icon: MessageCircleHeart },
  dietitian: { color: '#B9650E', icon: Apple },
}

/** A message being sent (or that failed), shown before the server confirms it. */
interface Pending {
  key: string
  threadId: string | null
  team: Team
  content: string
  createdAt: string
  state: 'sending' | 'failed'
  error?: string
  /** A prepared image to upload with it (kept so Retry can resend it). */
  image?: { blob: Blob; previewUrl: string }
  /** Set once the image is uploaded, so a retry doesn't upload it twice. */
  imagePath?: string
  /** A new chat's text went out with the query itself; only the image is left to send. */
  textSent?: boolean
}

/** Optional starting points for a new conversation; a chip fills in the first line. */
const TOPICS: Record<Team, string[]> = {
  therapist: ['Stress at work', 'Sleep', 'Low mood', 'Anxiety', 'Relationships', 'Something else'],
  dietitian: ['Healthy eating', 'Energy through the day', 'Weight', 'Meal planning', 'Something else'],
}
const starterFor = (topic: string) => (topic === 'Something else' ? '' : `I’d like to talk about ${topic.charAt(0).toLowerCase()}${topic.slice(1)}. `)

const firstName = (name: string | null | undefined) => name?.replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').split(/\s+/)[0] || undefined

/** What the card says about where the conversation is. */
function statusWord(c: ChatSummary, unread: boolean) {
  if (!isOpenStatus(c.status)) return 'Closed'
  if (unread) return 'New reply'
  return c.status === 'unassigned' ? `Waiting for a ${TEAMS[c.team].label.toLowerCase()}` : 'Ongoing'
}

const SEEN_KEY = storageKey('chat-seen')
function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function listTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return timeLabel(iso)
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** What the employee sees about who has their chat (Sticky Queue routing). */
function routingLine(team: Team, status: ThreadStatus) {
  const who = TEAMS[team].label.toLowerCase()
  if (status === 'unassigned') return `Waiting for the next available ${who}`
  if (status === 'in_progress') return `Your ${who} · replies within 24 business hours`
  return 'OmniWell wellness team · replies within 24 business hours'
}

/** The one-line privacy note under the header; opens to the full reply-time and crisis note. */
function PrivacyStrip({ team }: { team: Team }) {
  const { byId, emergency } = useWellnessContacts()
  const phone = byId.eap.phone
  const who = TEAMS[team].label.toLowerCase()
  return (
    <details className="group rounded-xl bg-mist px-3 py-1.5 text-xs text-muted">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1">Private to you and your {who}. Not for emergencies.</span>
        <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden />
      </summary>
      <p className="mt-1.5 leading-relaxed">
        This is a secure, asynchronous inbox: a {who} will reply within 24 business hours.{' '}
        <strong className="text-ink">
          If you are in crisis, call the EAP helpline now
          {phone ? (
            <>
              {' '}
              on{' '}
              <a href={telHref(phone)} className="whitespace-nowrap underline underline-offset-2">
                {phone}
              </a>
            </>
          ) : null}
          {emergency ? `, or ${emergency} in an emergency` : ''}.
        </strong>
      </p>
    </details>
  )
}

/** New replies and thread changes (status, receipts) across all of the employee's conversations. */
const CHAT_LIST_WATCHES: Watch[] = [
  { table: 'thread_messages', event: 'INSERT' },
  { table: 'therapist_threads', event: '*' },
]

/**
 * `team` opens straight onto that team's chat (from "Talk to Therapist" and
 * the like). Without it (/messages, the Chats tab) it's the hub: phones start
 * on the chat list, larger screens open the most recent open chat.
 */
export function SecureInbox({ team: routeTeam }: { team?: Team }) {
  const supabase = useMemo(() => createClient(), [])
  const contacts = useWellnessContacts()
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The open conversation, or a new one being started with a team. */
  const [active, setActive] = useState<{ kind: 'thread'; id: string } | { kind: 'new'; team: Team } | null>(null)
  // Arriving from "Talk to Therapist/Dietitian" opens the chat itself on phones; Back shows the list.
  const [mobileShowChat, setMobileShowChat] = useState(!!routeTeam)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<{ blob: Blob; previewUrl: string; note: string } | { preparing: true } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** Which team's earlier conversations are unfolded in the list. */
  const [expanded, setExpanded] = useState<Team | null>(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [seen, setSeen] = useState<Record<string, string>>({})
  const [announcement, setAnnouncement] = useState('')
  const activeIdRef = useRef<string | null>(null)

  // Private images in the open conversation get short-lived signed links.
  const imageUrls = useSignedImages(supabase, messages.flatMap((m) => (m.media_url ? [m.media_url] : [])))

  const activeChat = active?.kind === 'thread' ? (chats?.find((c) => c.id === active.id) ?? null) : null
  const activeTeam: Team | null = active?.kind === 'new' ? active.team : (activeChat?.team ?? null)
  activeIdRef.current = active?.kind === 'thread' ? active.id : null

  /* ----- loading ----- */

  const refreshChats = useCallback(async () => {
    const list = await listMyChats(supabase)
    setChats(list)
    setLoadError(null)
    return list
  }, [supabase])

  // First load: open the route team's newest open conversation, else start a new one with that team.
  // The hub opens the most recent open conversation of either team, if any.
  useEffect(() => {
    setSeen(readSeen())
    trackProgress(refreshChats())
      .then((list) => {
        if (!routeTeam) {
          const recent = list.find((c) => isOpenStatus(c.status))
          setActive(recent ? { kind: 'thread', id: recent.id } : null)
          return
        }
        const mine = list.filter((c) => c.team === routeTeam)
        const first = mine.find((c) => isOpenStatus(c.status)) ?? mine[0]
        setActive(first ? { kind: 'thread', id: first.id } : { kind: 'new', team: routeTeam })
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }, [refreshChats, routeTeam])

  // The chat list (other conversations' previews and status) refreshes when Realtime says
  // something it shows changed; the open conversation keeps itself up to date (below).
  const chatsRef = useRef(chats)
  chatsRef.current = chats
  const listLive = useRealtime(supabase, CHAT_LIST_WATCHES, (c) => {
    const row = newRow(c)
    const id = (c.table === 'thread_messages' ? row.thread_id : row.id) as string | undefined
    if (!id || id === activeIdRef.current) return
    if (c.table === 'thread_messages') {
      if (row.sender_role !== 'therapist') return // the employee's own messages are already in the list
    } else {
      const known = chatsRef.current?.find((x) => x.id === id)
      // Their own read receipts change nothing here.
      if (known && known.status === row.status && known.coach_read_at === row.coach_read_at && known.coach_delivered_at === row.coach_delivered_at) return
    }
    refreshChats().catch(() => {})
  })
  usePolling(() => refreshChats().catch(() => {}), listLive ? 120_000 : 30_000, chats !== null)

  // Load the open conversation.
  useEffect(() => {
    setMessages([])
    if (active?.kind !== 'thread') return
    const id = active.id
    setLoadingThread(true)
    trackProgress(loadMessages(supabase, id))
      // Merge rather than replace: a message sent while this was loading must stay.
      .then((list) => {
        if (activeIdRef.current === id) setMessages((cur) => mergeMessages(list, cur))
      })
      .catch((e) => setNotice(errorMessage(e)))
      .finally(() => setLoadingThread(false))
  }, [active, supabase])

  // Replies, status and read receipts for the open conversation: pushed by Realtime, polled as a fallback.
  const { bump } = useLivePolling(async () => {
    const id = activeIdRef.current
    if (!id) return
    const newest = messages[messages.length - 1]?.created_at ?? null
    const { messages: fresh, status, receipts } = await pollThread(supabase, id, newest)
    if (activeIdRef.current !== id) return
    const known = new Set(messages.map((m) => m.id))
    const replies = fresh.filter((m) => !known.has(m.id) && m.sender_role === 'therapist')
    if (fresh.some((m) => !known.has(m.id))) setMessages((cur) => mergeMessages(cur, fresh))
    if (replies.length) {
      bump()
      const label = activeChat?.coach_name ?? (activeChat ? `your ${TEAMS[activeChat.team].label.toLowerCase()}` : 'your wellness team')
      setAnnouncement(replies.length === 1 ? `New reply from ${label}.` : `${replies.length} new replies from ${label}.`)
    }
    if (status && activeChat && status !== activeChat.status) {
      setChats((cs) => cs?.map((c) => (c.id === id ? { ...c, status } : c)) ?? cs)
      // A coach just claimed it (or it was released): refresh for their name.
      refreshChats().catch(() => {})
    }
    if (receipts && activeChat && (receipts.coach_delivered_at !== activeChat.coach_delivered_at || receipts.coach_read_at !== activeChat.coach_read_at)) {
      setChats((cs) => cs?.map((c) => (c.id === id ? { ...c, coach_delivered_at: receipts.coach_delivered_at, coach_read_at: receipts.coach_read_at } : c)) ?? cs)
    }
  }, active?.kind === 'thread', { supabase, threadId: active?.kind === 'thread' ? active.id : null })

  // Read receipts: the open conversation counts as read while it's on screen
  // (the database ignores calls with nothing new to mark).
  const lastIncoming = [...messages].reverse().find((m) => m.sender_role === 'therapist')?.id
  useEffect(() => {
    const id = activeIdRef.current
    if (!id || !mobileShowChat) return
    const mark = () => document.visibilityState === 'visible' && markRead(supabase, id)
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [lastIncoming, active, mobileShowChat, supabase])

  // Keep the list preview and "seen" marker in step with the open conversation.
  useEffect(() => {
    const id = activeIdRef.current
    const last = messages[messages.length - 1]
    if (!id || !last) return
    setChats((cs) => cs?.map((c) => (c.id === id && c.last?.created_at !== last.created_at ? { ...c, last: { sender_role: last.sender_role, content: last.content, created_at: last.created_at, media_url: last.media_url } } : c)) ?? cs)
    setSeen((s) => {
      if (s[id] === last.created_at) return s
      const next = { ...s, [id]: last.created_at }
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next))
      } catch {
        /* per-device convenience only */
      }
      return next
    })
  }, [messages])

  /* ----- actions ----- */

  function open(next: typeof active) {
    setActive(next)
    setMobileShowChat(true)
    setNotice(null)
    setDraft('')
    clearAttachment()
    setMenuOpen(false)
    const team = next?.kind === 'new' ? next.team : chats?.find((c) => next?.kind === 'thread' && c.id === next.id)?.team
    // Keep the address in step on team pages; the hub stays at /messages.
    if (routeTeam && team && team !== routeTeam) window.history.replaceState(null, '', TEAMS[team].inboxPath)
  }

  async function deliver(p: Pending) {
    setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'sending', error: undefined } : x)))
    try {
      let threadId = p.threadId
      let textSent = !!p.textSent
      if (!threadId) {
        // First message of a new conversation: the routing engine opens it with this
        // message, straight to the employee's previous coach if they have room, else
        // into the team's pool (supabase/sticky-routing.sql).
        const res = await submitUserQuery(p.team, p.content)
        if (!res.ok) throw new Error(res.error)
        const id = res.data.threadId
        threadId = id
        textSent = true
        const now = new Date().toISOString()
        setChats((cs) => [{ id, team: p.team, status: res.data.status, created_at: now, last: { sender_role: 'user', content: p.content, created_at: now, media_url: null }, coach_name: null }, ...(cs ?? [])])
        // Routed straight to their coach: fetch the coach's name for the header.
        if (res.data.assignedToPreferredCoach) refreshChats().catch(() => {})
        setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, threadId: id, textSent } : x)))
        activeIdRef.current = id
        setActive({ kind: 'thread', id })
        const who = TEAMS[p.team].label.toLowerCase()
        setAnnouncement(res.data.assignedToPreferredCoach ? `Sent to your ${who}.` : `Sent. The next available ${who} will pick this up.`)
      }
      // Upload the image first (once), then send the message pointing at it.
      let imagePath = p.imagePath
      if (p.image && !imagePath) {
        const form = new FormData()
        form.append('file', new File([p.image.blob], 'image', { type: p.image.blob.type }))
        form.append('threadId', threadId)
        const up = await uploadChatImage(form)
        if (!up.ok) throw new Error(up.error)
        imagePath = up.data.path
        setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, imagePath } : x)))
      }
      // A new chat's text is already saved; its image (if any) follows as its own message.
      const saved = textSent ? (imagePath ? [await sendUserMessage(supabase, threadId, '', imagePath)] : await loadMessages(supabase, threadId)) : [await sendUserMessage(supabase, threadId, p.content, imagePath)]
      if (p.image) URL.revokeObjectURL(p.image.previewUrl)
      setPending((ps) => ps.filter((x) => x.key !== p.key))
      if (activeIdRef.current === threadId) setMessages((cur) => mergeMessages(cur, saved))
      // A follow-up in an existing conversation (a brand-new chat already alerted coaches when it was
      // opened): let the coach know. The server checks it's theirs and rate-limits it.
      if (p.threadId && !p.textSent) notifyCoachOfReply(threadId).catch(() => {})
      bump()
    } catch (e) {
      setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'failed', error: errorMessage(e) } : x)))
    }
  }

  function clearAttachment() {
    setAttachment((a) => {
      if (a && 'previewUrl' in a) URL.revokeObjectURL(a.previewUrl)
      return null
    })
  }

  /** Images only: shrinks and re-encodes it in the browser, then shows it ready to send. */
  async function attach(file: File) {
    setNotice(null)
    clearAttachment()
    setAttachment({ preparing: true })
    try {
      const img = await prepareChatImage(file)
      setAttachment({ blob: img.blob, previewUrl: img.previewUrl, note: `Compressed: ${formatBytes(img.originalBytes)} → ${formatBytes(img.blob.size)}` })
      bump()
    } catch (e) {
      setAttachment(null)
      setNotice(e instanceof ChatImageError ? e.message : 'Couldn’t read that image. Try another one.')
    }
  }

  function send() {
    if (!activeTeam) return
    const image = attachment && 'previewUrl' in attachment ? attachment : undefined
    const isNew = active?.kind !== 'thread'
    // A new chat starts with words, so the team knows what it's about; photos can follow.
    const parsed = validateMessage(draft, !!image && !isNew)
    if (!parsed.ok) return setNotice(isNew && image ? 'Add a short message to start the chat. Your photo will be sent with it.' : parsed.error)
    setNotice(null)
    const p: Pending = {
      key: `p-${Date.now()}`,
      threadId: active?.kind === 'thread' ? active.id : null,
      team: activeTeam,
      content: parsed.value,
      createdAt: new Date().toISOString(),
      state: 'sending',
      image,
    }
    setPending((ps) => [...ps, p])
    setDraft('')
    setAttachment(null) // the pending message now owns the preview URL
    deliver(p)
  }

  /* ----- view ----- */

  const q = query.trim().toLowerCase()
  const visibleChats = (chats ?? []).filter(
    (c) => !q || TEAMS[c.team].label.toLowerCase().includes(q) || (c.coach_name?.toLowerCase().includes(q) ?? false) || (c.last?.content.toLowerCase().includes(q) ?? false),
  )
  // One card per ongoing conversation (normally one per team, thanks to sticky routing);
  // closed ones fold into that team's card, or sit under "Past conversations".
  const current = visibleChats.filter((c) => isOpenStatus(c.status))
  const closedChats = visibleChats.filter((c) => !isOpenStatus(c.status))
  const currentTeams = new Set(current.map((c) => c.team))
  const past = closedChats.filter((c) => !currentTeams.has(c.team))

  const threadId = active?.kind === 'thread' ? active.id : null
  const coachFirst = firstName(activeChat?.coach_name)
  const views: ChatMessageView[] = [
    ...messages.map((m) => ({
      id: m.id,
      mine: m.sender_role === 'user',
      content: m.content,
      createdAt: m.created_at,
      state: receiptState(m.created_at, activeChat?.coach_delivered_at, activeChat?.coach_read_at),
      image: m.media_url ? { src: imageUrls.get(m.media_url) ?? null } : undefined,
      avatar:
        m.sender_role === 'therapist' && activeChat ? (
          <ChatAvatar color={TEAM_LOOK[activeChat.team].color} icon={TEAM_LOOK[activeChat.team].icon} src={activeChat.coach_avatar_url} size="xs" />
        ) : undefined,
    })),
    ...pending
      .filter((p) => (threadId ? p.threadId === threadId : active?.kind === 'new' && !p.threadId && p.team === activeTeam))
      .map((p) => ({ id: p.key, mine: true, content: p.content, createdAt: p.createdAt, state: p.state, error: p.error, onRetry: () => deliver(p), image: p.image ? { src: p.image.previewUrl } : undefined })),
  ]
  const closed = !!activeChat && !isOpenStatus(activeChat.status)
  const look = activeTeam ? TEAM_LOOK[activeTeam] : null

  const isUnread = (c: ChatSummary) => !!c.last && c.last.sender_role === 'therapist' && (!seen[c.id] || seen[c.id] < c.last.created_at) && threadId !== c.id
  const previewOf = (c: ChatSummary) =>
    c.last ? `${c.last.sender_role === 'user' ? 'You: ' : ''}${c.last.media_url ? (c.last.content ? `📷 ${c.last.content}` : PHOTO_PREVIEW) : c.last.content}` : 'No messages yet'

  /** A compact row for a closed conversation (inside a coach card, or under Past). */
  const pastRow = (c: ChatSummary) => (
    <li key={c.id} className="px-3">
      <button
        type="button"
        onClick={() => open({ kind: 'thread', id: c.id })}
        aria-current={threadId === c.id ? 'true' : undefined}
        className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-mist ${threadId === c.id ? 'bg-mist' : ''}`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{c.coach_name ?? TEAMS[c.team].label}</span>
          <span className="block truncate text-xs text-muted">Closed · {previewOf(c)}</span>
        </span>
        <span className="shrink-0 text-xs text-muted">{listTime(c.last?.created_at ?? c.created_at)}</span>
      </button>
    </li>
  )

  const sidebar = (
    <>
      <ChatListHeader
        title="Your care team"
        actions={
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-sm font-bold text-white"
            >
              <MessageSquarePlus className="h-4 w-4" aria-hidden /> New
            </button>
            {menuOpen && (
              <ul role="menu" className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-2xl bg-white py-2 shadow-xl ring-1 ring-line">
                {(Object.keys(TEAMS) as Team[]).map((t) => (
                  <li key={t}>
                    <button type="button" role="menuitem" onClick={() => open({ kind: 'new', team: t })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold text-ink hover:bg-mist">
                      <ChatAvatar color={TEAM_LOOK[t].color} icon={TEAM_LOOK[t].icon} size="xs" />
                      Talk to a {TEAMS[t].label.toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
      <ChatSearch value={query} onChange={setQuery} placeholder="Search messages" />
      <div className="flex-1 overflow-y-auto pb-3 pt-1">
        {chats === null ? (
          <ul aria-label="Loading conversations">
            {Array.from({ length: 2 }, (_, i) => (
              <li key={i} className="mx-3 my-2 flex items-center gap-3 rounded-2xl p-3 ring-1 ring-line">
                <span className="h-12 w-12 rounded-full bg-mist motion-safe:animate-pulse" />
                <span className="flex-1 space-y-2">
                  <span className="block h-3.5 w-24 rounded bg-mist motion-safe:animate-pulse" />
                  <span className="block h-3 w-40 rounded bg-mist motion-safe:animate-pulse" />
                </span>
              </li>
            ))}
          </ul>
        ) : visibleChats.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted">
            {query ? (
              'No conversations match your search.'
            ) : (
              <>
                No conversations yet. Who would you like to talk to?
                <span className="mt-4 flex flex-col items-center gap-2">
                  {(Object.keys(TEAMS) as Team[]).map((t) => (
                    <button key={t} type="button" onClick={() => open({ kind: 'new', team: t })} className="inline-flex w-56 items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white" style={{ background: TEAM_LOOK[t].color }}>
                      <PenSquare className="h-4 w-4" aria-hidden /> Talk to a {TEAMS[t].label.toLowerCase()}
                    </button>
                  ))}
                </span>
              </>
            )}
          </div>
        ) : (
          <>
            <ul aria-label="Your conversations">
              {current.map((c) => {
                const unread = isUnread(c)
                const earlier = closedChats.filter((x) => x.team === c.team)
                const open_ = expanded === c.team
                return (
                  <li key={c.id}>
                    <ul>
                      <ChatListItem
                        active={threadId === c.id}
                        accent={TEAM_LOOK[c.team].color}
                        onClick={() => open({ kind: 'thread', id: c.id })}
                        avatar={<ChatAvatar color={TEAM_LOOK[c.team].color} icon={TEAM_LOOK[c.team].icon} src={c.coach_avatar_url} online={c.coach_online} />}
                        title={c.coach_name ?? TEAMS[c.team].label}
                        meta={
                          <span style={{ color: TEAM_LOOK[c.team].color }}>
                            {c.coach_name ? `${TEAMS[c.team].label} · ` : ''}
                            {statusWord(c, unread)}
                          </span>
                        }
                        time={listTime(c.last?.created_at ?? c.created_at)}
                        preview={<span className={unread ? 'font-semibold text-ink' : undefined}>{previewOf(c)}</span>}
                        badge={unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#C42B1C]" aria-label="New reply" /> : undefined}
                      />
                      {earlier.length > 0 && (
                        <li className="px-3">
                          <button
                            type="button"
                            onClick={() => setExpanded(open_ ? null : c.team)}
                            aria-expanded={open_}
                            className="ml-3 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-mist"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 transition ${open_ ? '' : '-rotate-90'}`} aria-hidden />
                            {earlier.length === 1 ? '1 earlier conversation' : `${earlier.length} earlier conversations`}
                          </button>
                        </li>
                      )}
                      {open_ && earlier.map(pastRow)}
                    </ul>
                  </li>
                )
              })}
            </ul>
            {past.length > 0 && (
              <>
                <p className="mt-5 px-6 text-xs font-bold uppercase tracking-wide text-muted">Past conversations</p>
                <ul className="mt-1" aria-label="Past conversations">
                  {past.map(pastRow)}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  )

  const eapPhone = contacts.byId.eap.phone
  const startedOn = activeChat ? new Date(activeChat.created_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : null

  const main =
    !active || !activeTeam || !look ? (
      <ChatPlaceholder icon={MessageCircleHeart} title="Your care team">
        Choose a conversation on the left, or start a new one. Everything here is private to you and your coach.
        <span className="mt-4 flex flex-wrap justify-center gap-2">
          {(Object.keys(TEAMS) as Team[]).map((t) => (
            <button key={t} type="button" onClick={() => open({ kind: 'new', team: t })} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-white" style={{ background: TEAM_LOOK[t].color }}>
              <PenSquare className="h-4 w-4" aria-hidden /> Talk to a {TEAMS[t].label.toLowerCase()}
            </button>
          ))}
        </span>
      </ChatPlaceholder>
    ) : (
      <>
        <ChatHeader
          onBack={() => setMobileShowChat(false)}
          avatar={<ChatAvatar color={look.color} icon={look.icon} src={activeChat?.coach_avatar_url} online={!closed && activeChat?.coach_online} />}
          title={activeChat?.coach_name ?? (active.kind === 'new' ? `Talk to a ${TEAMS[activeTeam].label.toLowerCase()}` : TEAMS[activeTeam].label)}
          subtitle={
            <>
              <span className="font-bold" style={{ color: look.color }}>
                {activeChat?.coach_title || TEAMS[activeTeam].label}
              </span>
              {' · '}
              {closed
                ? 'Conversation closed'
                : activeChat?.coach_online
                  ? 'Online · usually replies within a day'
                  : activeChat?.status === 'unassigned'
                    ? `Waiting for the next available ${TEAMS[activeTeam].label.toLowerCase()}`
                    : 'Usually replies within a day'}
            </>
          }
          actions={
            eapPhone ? (
              <a
                href={telHref(eapPhone)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-[#B8402B] ring-1 ring-[#E8B4A9] transition hover:bg-[#FBEDEA]"
                aria-label={`Need help now? Call the EAP helpline on ${eapPhone}`}
              >
                <ShieldAlert className="h-4 w-4" aria-hidden />
                <span className="sm:hidden">Help now</span>
                <span className="max-sm:hidden">Need help now?</span>
              </a>
            ) : undefined
          }
          below={<PrivacyStrip team={activeTeam} />}
        />
        <MessageList
          messages={views}
          loading={loadingThread}
          readerName={coachFirst}
          notice={
            activeChat ? (
              <ChatSystemNote>
                Conversation started{activeChat.coach_name ? ` with ${activeChat.coach_name}` : ''} · {startedOn}
              </ChatSystemNote>
            ) : undefined
          }
          empty={
            <div className="mx-auto mt-2 max-w-md rounded-3xl bg-white p-5 ring-1 ring-line">
              <p className="text-sm font-bold text-muted">New conversation</p>
              <p className="mt-0.5 font-display text-xl font-extrabold text-ink">Who would you like to talk to?</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(Object.keys(TEAMS) as Team[]).map((t) => {
                  const on = t === activeTeam
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => !on && open({ kind: 'new', team: t })}
                      aria-pressed={on}
                      className="rounded-2xl p-3 text-left ring-1 transition"
                      style={on ? { background: `${TEAM_LOOK[t].color}14`, boxShadow: `inset 0 0 0 2px ${TEAM_LOOK[t].color}`, ['--tw-ring-color' as string]: 'transparent' } : { ['--tw-ring-color' as string]: '#D3E2E0' }}
                    >
                      <ChatAvatar color={TEAM_LOOK[t].color} icon={TEAM_LOOK[t].icon} size="xs" />
                      <span className="mt-2 block font-bold text-ink">{TEAMS[t].label}</span>
                      <span className="block text-xs text-muted">{t === 'therapist' ? 'Stress, mood, sleep, relationships' : 'Food, energy, weight, habits'}</span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-4 text-sm font-bold text-ink">
                What’s it about? <span className="font-normal text-muted">(optional)</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOPICS[activeTeam].map((topic) => {
                  const starter = starterFor(topic)
                  const on = !!starter && draft.startsWith(starter)
                  return (
                    <button
                      key={topic}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft((d) => (on ? d.slice(starter.length) : starter + d.replace(/^I’d like to talk about [^.]*\. /, '')))}
                      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${on ? 'bg-ink text-white' : 'bg-mist text-ink ring-1 ring-line hover:bg-white'}`}
                    >
                      {topic}
                    </button>
                  )
                })}
              </div>
              <p className="mt-4 text-xs text-muted">{TEAMS[activeTeam].intro} You’ll usually hear back within a day. If you’re in danger, call the EAP helpline{contacts.emergency ? ` or ${contacts.emergency}` : ''} now.</p>
            </div>
          }
        />
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        {notice && (
          <p role="alert" className="shrink-0 bg-[#FDECEA] px-4 py-2 text-sm font-semibold text-[#8C1D13]">
            {notice}
          </p>
        )}
        {closed ? (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-line bg-white px-4 py-3 text-sm text-muted">
            This conversation has been closed. You can still read it.
            <button type="button" onClick={() => open({ kind: 'new', team: activeTeam })} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 font-bold text-white">
              <PenSquare className="h-4 w-4" aria-hidden /> Start a new conversation
            </button>
          </div>
        ) : (
          <Composer
            value={draft}
            onChange={(v) => {
              setDraft(v)
              bump()
            }}
            onSend={send}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={chats === null}
            placeholder={coachFirst ? `Write to ${coachFirst}…` : `Write to a ${TEAMS[activeTeam].label.toLowerCase()}…`}
            onAttach={attach}
            onRemoveAttachment={clearAttachment}
            attachment={attachment ? ('previewUrl' in attachment ? { previewUrl: attachment.previewUrl, note: attachment.note } : { previewUrl: '', preparing: true }) : null}
          />
        )}
      </>
    )

  if (loadError && chats === null) {
    return <p role="alert" className="notice-error">{loadError}</p>
  }

  return (
    <ChatFrame
      sidebar={sidebar}
      main={main}
      showMain={mobileShowChat}
      // Phones: full screen above the bottom navigation (58px + safe area).
      // Larger screens: a card filling the page.
      className="fixed inset-x-0 top-0 bottom-[calc(3.625rem+env(safe-area-inset-bottom))] z-30 max-md:rounded-none max-md:shadow-none max-md:ring-0 md:static md:h-[calc(100dvh-5rem)] md:min-h-[480px]"
    />
  )
}
