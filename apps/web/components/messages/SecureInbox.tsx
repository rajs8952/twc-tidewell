'use client'

import { Apple, MessageCircleHeart, MessageSquarePlus, Phone, PenSquare } from 'lucide-react'
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
  timeLabel,
  type ChatMessageView,
} from '@/components/chat/ChatUI'
import { uploadChatImage } from '@/app/actions/chat-media'
import { errorMessage } from '@rajs8952/core/errors'
import { ChatImageError, prepareChatImage } from '@/lib/chat-image'
import { storageKey } from '@/lib/brand'
import { listMyChats, loadMessages, mergeMessages, pollThread, sendUserMessage, startChat, type ChatSummary } from '@/lib/chat-data'
import { MAX_MESSAGE_LENGTH, PHOTO_PREVIEW, TEAMS, validateMessage, type Team, type ThreadMessage } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { usePolling } from '@/lib/usePolling'
import { useLivePolling } from '@/lib/useLivePolling'
import { useSignedImages } from '@/lib/useSignedImages'
import { WELLNESS_BY_ID, telHref } from '@/lib/wellness-team'

/* ------------------------------------------------------------------
 * The employee's secure inbox, laid out like WhatsApp Web: their
 * conversations with the therapist and dietitian teams on the left, the
 * open conversation on the right. Asynchronous by design (no WebSockets
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
}

type Filter = 'all' | Team

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

function Disclaimer({ team }: { team: Team }) {
  const phone = WELLNESS_BY_ID.eap.phone
  return (
    <ChatNotice>
      This is a secure asynchronous inbox. A {TEAMS[team].label.toLowerCase()} will reply within 24 business hours.{' '}
      <strong>
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
    </ChatNotice>
  )
}

export function SecureInbox({ team: routeTeam }: { team: Team }) {
  const supabase = useMemo(() => createClient(), [])
  const [chats, setChats] = useState<ChatSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The open conversation, or a new one being started with a team. */
  const [active, setActive] = useState<{ kind: 'thread'; id: string } | { kind: 'new'; team: Team } | null>(null)
  // Arriving from "Talk to Therapist/Dietitian" opens the chat itself on phones; Back shows the list.
  const [mobileShowChat, setMobileShowChat] = useState(true)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])
  const [draft, setDraft] = useState('')
  const [attachment, setAttachment] = useState<{ blob: Blob; previewUrl: string } | { preparing: true } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
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
  useEffect(() => {
    setSeen(readSeen())
    trackProgress(refreshChats())
      .then((list) => {
        const mine = list.filter((c) => c.team === routeTeam)
        const first = mine.find((c) => c.status === 'open') ?? mine[0]
        setActive(first ? { kind: 'thread', id: first.id } : { kind: 'new', team: routeTeam })
      })
      .catch((e) => setLoadError(errorMessage(e)))
  }, [refreshChats, routeTeam])

  // The chat list (other conversations' previews) refreshes in the background.
  usePolling(() => refreshChats().catch(() => {}), 30_000, chats !== null)

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

  // Poll the open conversation for replies: fast while active, slower when quiet.
  const { bump } = useLivePolling(async () => {
    const id = activeIdRef.current
    if (!id) return
    const newest = messages[messages.length - 1]?.created_at ?? null
    const { messages: fresh, status } = await pollThread(supabase, id, newest)
    if (activeIdRef.current !== id) return
    const known = new Set(messages.map((m) => m.id))
    const replies = fresh.filter((m) => !known.has(m.id) && m.sender_role === 'therapist')
    if (fresh.some((m) => !known.has(m.id))) setMessages((cur) => mergeMessages(cur, fresh))
    if (replies.length) {
      bump()
      const label = activeChat ? TEAMS[activeChat.team].label.toLowerCase() : 'wellness team'
      setAnnouncement(replies.length === 1 ? `New reply from your ${label}.` : `${replies.length} new replies from your ${label}.`)
    }
    if (status && activeChat && status !== activeChat.status) setChats((cs) => cs?.map((c) => (c.id === id ? { ...c, status } : c)) ?? cs)
  }, active?.kind === 'thread')

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
    if (team && team !== routeTeam) window.history.replaceState(null, '', TEAMS[team].inboxPath)
  }

  async function deliver(p: Pending) {
    setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, state: 'sending', error: undefined } : x)))
    try {
      let threadId = p.threadId
      if (!threadId) {
        // First message of a new conversation: open it, then send.
        const thread = await startChat(supabase, p.team)
        threadId = thread.id
        setChats((cs) => [{ ...thread, last: null }, ...(cs ?? [])])
        setPending((ps) => ps.map((x) => (x.key === p.key ? { ...x, threadId } : x)))
        setActive({ kind: 'thread', id: thread.id })
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
      const saved = await sendUserMessage(supabase, threadId, p.content, imagePath)
      if (p.image) URL.revokeObjectURL(p.image.previewUrl)
      setPending((ps) => ps.filter((x) => x.key !== p.key))
      if (activeIdRef.current === threadId) setMessages((cur) => mergeMessages(cur, [saved]))
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
      setAttachment({ blob: img.blob, previewUrl: img.previewUrl })
      bump()
    } catch (e) {
      setAttachment(null)
      setNotice(e instanceof ChatImageError ? e.message : 'Couldn’t read that image. Try another one.')
    }
  }

  function send() {
    if (!activeTeam) return
    const image = attachment && 'previewUrl' in attachment ? attachment : undefined
    const parsed = validateMessage(draft, !!image)
    if (!parsed.ok) return setNotice(parsed.error)
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

  const visibleChats = (chats ?? []).filter((c) => {
    if (filter !== 'all' && c.team !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || TEAMS[c.team].label.toLowerCase().includes(q) || (c.last?.content.toLowerCase().includes(q) ?? false)
  })

  const threadId = active?.kind === 'thread' ? active.id : null
  const views: ChatMessageView[] = [
    ...messages.map((m) => ({
      id: m.id,
      mine: m.sender_role === 'user',
      content: m.content,
      createdAt: m.created_at,
      state: 'sent' as const,
      image: m.media_url ? { src: imageUrls.get(m.media_url) ?? null } : undefined,
    })),
    ...pending
      .filter((p) => (threadId ? p.threadId === threadId : active?.kind === 'new' && !p.threadId && p.team === activeTeam))
      .map((p) => ({ id: p.key, mine: true, content: p.content, createdAt: p.createdAt, state: p.state, error: p.error, onRetry: () => deliver(p), image: p.image ? { src: p.image.previewUrl } : undefined })),
  ]
  const closed = activeChat?.status === 'closed'
  const look = activeTeam ? TEAM_LOOK[activeTeam] : null

  const sidebar = (
    <>
      <ChatListHeader
        title="Chats"
        actions={
          <div className="relative">
            <ChatIconButton label="New chat" onClick={() => setMenuOpen((o) => !o)}>
              <MessageSquarePlus className="h-5 w-5" aria-hidden />
            </ChatIconButton>
            {menuOpen && (
              <ul role="menu" className="absolute right-0 top-11 z-20 w-56 overflow-hidden rounded-lg bg-white py-2 shadow-xl ring-1 ring-black/5">
                {(Object.keys(TEAMS) as Team[]).map((t) => (
                  <li key={t}>
                    <button type="button" role="menuitem" onClick={() => open({ kind: 'new', team: t })} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-[#F5F6F6]">
                      <ChatAvatar color={TEAM_LOOK[t].color} icon={TEAM_LOOK[t].icon} size="sm" />
                      New chat with {TEAMS[t].label.toLowerCase()}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        }
      />
      <ChatSearch value={query} onChange={setQuery} placeholder="Search chats" />
      <ChatFilters<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { id: 'all', label: 'All' },
          { id: 'therapist', label: 'Therapist' },
          { id: 'dietitian', label: 'Dietitian' },
        ]}
      />
      <ul className="flex-1 overflow-y-auto" aria-label="Your conversations">
        {chats === null ? (
          Array.from({ length: 3 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-3 py-3">
              <span className="h-12 w-12 rounded-full bg-[#F0F2F5] motion-safe:animate-pulse" />
              <span className="flex-1 space-y-2">
                <span className="block h-3.5 w-24 rounded bg-[#F0F2F5] motion-safe:animate-pulse" />
                <span className="block h-3 w-40 rounded bg-[#F0F2F5] motion-safe:animate-pulse" />
              </span>
            </li>
          ))
        ) : visibleChats.length === 0 ? (
          <li className="px-6 py-10 text-center text-sm text-[#54656F]">{query ? 'No chats match your search.' : 'No conversations yet. Start one with the button above.'}</li>
        ) : (
          visibleChats.map((c) => {
            const unread = !!c.last && c.last.sender_role === 'therapist' && (!seen[c.id] || seen[c.id] < c.last.created_at) && threadId !== c.id
            return (
              <ChatListItem
                key={c.id}
                active={threadId === c.id}
                onClick={() => open({ kind: 'thread', id: c.id })}
                avatar={<ChatAvatar color={TEAM_LOOK[c.team].color} icon={TEAM_LOOK[c.team].icon} />}
                title={TEAMS[c.team].label}
                time={listTime(c.last?.created_at ?? c.created_at)}
                preview={
                  <>
                    {c.status === 'closed' && <span className="font-semibold">Closed · </span>}
                    {c.last ? `${c.last.sender_role === 'user' ? 'You: ' : ''}${c.last.media_url ? (c.last.content ? `📷 ${c.last.content}` : PHOTO_PREVIEW) : c.last.content}` : 'No messages yet'}
                  </>
                }
                badge={unread ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#25D366] ring-2 ring-white" aria-label="New reply" /> : undefined}
              />
            )
          })
        )}
      </ul>
    </>
  )

  const main =
    !active || !activeTeam || !look ? (
      <ChatPlaceholder icon={MessageCircleHeart} title="OmniWell Messages">
        Choose a chat on the left, or start a new one with a therapist or dietitian.
      </ChatPlaceholder>
    ) : (
      <>
        <ChatHeader
          onBack={() => setMobileShowChat(false)}
          avatar={<ChatAvatar color={look.color} icon={look.icon} size="sm" />}
          title={TEAMS[activeTeam].label}
          subtitle={closed ? 'Conversation closed' : 'OmniWell wellness team · replies within 24 business hours'}
          actions={
            WELLNESS_BY_ID.eap.phone ? (
              <ChatIconButton label={`Call the EAP on ${WELLNESS_BY_ID.eap.phone}`} href={telHref(WELLNESS_BY_ID.eap.phone)}>
                <Phone className="h-5 w-5" aria-hidden />
              </ChatIconButton>
            ) : undefined
          }
        />
        <MessageList
          messages={views}
          loading={loadingThread}
          notice={<Disclaimer team={activeTeam} />}
          empty={
            <div className="mx-auto mt-6 max-w-sm rounded-lg bg-white/90 px-4 py-3 text-center text-sm text-[#3B4A54] shadow-sm">
              <p className="font-semibold">Write to a {TEAMS[activeTeam].label.toLowerCase()}</p>
              <p className="mt-1">{TEAMS[activeTeam].intro}</p>
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
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-3 px-4 py-3 text-sm text-[#54656F]" style={{ background: '#F0F2F5' }}>
            This conversation has been closed. You can still read it.
            <button type="button" onClick={() => open({ kind: 'new', team: activeTeam })} className="inline-flex items-center gap-1.5 rounded-full bg-[#008069] px-4 py-2 font-semibold text-white">
              <PenSquare className="h-4 w-4" aria-hidden /> Start a new chat
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
            onAttach={attach}
            onRemoveAttachment={clearAttachment}
            attachment={attachment ? ('previewUrl' in attachment ? { previewUrl: attachment.previewUrl } : { previewUrl: '', preparing: true }) : null}
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
      // Phones: full screen above the bottom navigation (58px + safe area), like the WhatsApp app.
      // Larger screens: a card filling the page, like WhatsApp Web.
      className="fixed inset-x-0 top-0 bottom-[calc(3.625rem+env(safe-area-inset-bottom))] z-30 max-md:rounded-none max-md:shadow-none max-md:ring-0 md:static md:h-[calc(100dvh-5rem)] md:min-h-[480px]"
    />
  )
}
