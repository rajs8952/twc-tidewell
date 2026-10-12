'use client'

import { AlertCircle, ArrowLeft, ImagePlus, Loader2, Lock, Search, SendHorizontal, X, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type ReactNode } from 'react'

/* ------------------------------------------------------------------
 * OmniWell's chat building blocks ("care conversation" design), shared by
 * the employee inbox (components/messages/SecureInbox.tsx) and the staff
 * portal (components/therapist/TherapistPortal.tsx):
 *   ChatFrame     two panes: chat list | conversation (one at a time on phones)
 *   ChatList*     list header, search and card rows
 *   ChatHeader    the conversation's top bar, with an optional strip below
 *   MessageList   a calm background, grouped messages with one time per
 *                 group, and "Sent / Delivered / Seen" in words
 *   Composer      a soft input with a labelled Send button
 * Colours keep text at 4.5:1 or more against its background.
 * ------------------------------------------------------------------ */

const C = {
  panel: '#FFFFFF',
  soft: '#F4F7F8',
  mist: '#EDF4F3',
  line: '#D3E2E0',
  outgoing: '#1A6DB5',
  text: '#0F2F37',
  meta: '#557178',
  accent: '#1A6DB5',
}

/* ---------- Frame ---------- */

export function ChatFrame({ sidebar, main, showMain, className = '' }: { sidebar: ReactNode; main: ReactNode; showMain: boolean; className?: string }) {
  return (
    // Chats update themselves; pull to refresh would only reload the page and lose a draft.
    <div data-no-pull-refresh className={`flex overflow-hidden rounded-3xl bg-white shadow-[0_16px_40px_-28px_rgba(15,47,55,0.45)] ring-1 ring-line ${className}`}>
      <aside className={`${showMain ? 'hidden md:flex' : 'flex'} w-full flex-col border-r md:w-[340px] md:shrink-0 lg:w-[380px]`} style={{ borderColor: C.line }}>
        {sidebar}
      </aside>
      <section className={`${showMain ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`} aria-label="Conversation">
        {main}
      </section>
    </div>
  )
}

/** The right pane before a chat is chosen. */
export function ChatPlaceholder({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center" style={{ background: C.soft }}>
      <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white ring-1 ring-line" style={{ color: C.accent }}>
        <Icon className="h-9 w-9" aria-hidden />
      </span>
      <p className="font-display text-2xl font-extrabold" style={{ color: C.text }}>
        {title}
      </p>
      <div className="max-w-md text-sm" style={{ color: C.meta }}>
        {children}
      </div>
    </div>
  )
}

/* ---------- Avatars ---------- */

export function ChatAvatar({ color, icon: Icon, initials, size = 'md', src, online }: { color: string; icon?: LucideIcon; initials?: string; size?: 'xs' | 'sm' | 'md'; src?: string | null; online?: boolean }) {
  const box = size === 'xs' ? 'h-8 w-8 text-xs' : size === 'sm' ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base'
  return (
    <span className={`relative flex shrink-0 self-start ${box}`} aria-hidden>
      {src ? (
        // A coach's profile photo (public avatars bucket); a plain <img> keeps it simple and cacheable.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full rounded-full object-cover" loading="lazy" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full font-bold text-white" style={{ background: color }}>
          {Icon ? <Icon className={size === 'xs' ? 'h-4 w-4' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} /> : initials}
        </span>
      )}
      {online && <span className={`absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white ${size === 'md' ? 'h-3 w-3' : 'h-2.5 w-2.5'}`} />}
    </span>
  )
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '?'

/* ---------- Chat list ---------- */

export function ChatListHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-2 pt-5" style={{ background: C.panel }}>
      <h2 className="font-display text-2xl font-extrabold" style={{ color: C.text }}>
        {title}
      </h2>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  )
}

export function ChatSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const id = useId()
  return (
    <div className="shrink-0 px-4 py-2">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="flex items-center gap-3 rounded-2xl px-3" style={{ background: C.mist }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: C.meta }} aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-[#557178]"
          style={{ color: C.text }}
        />
      </div>
    </div>
  )
}

/** Filter chips under the search box. */
export function ChatFilters<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label="Filter conversations" className="flex shrink-0 gap-2 overflow-x-auto px-4 py-2">
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold transition"
            style={on ? { background: C.text, color: '#FFFFFF' } : { background: C.mist, color: C.meta }}
          >
            {o.label}
            {o.count ? <span className="ml-1 tabular-nums">{o.count}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

export function ChatListItem({
  avatar,
  title,
  meta,
  preview,
  time,
  badge,
  active,
  accent = C.accent,
  onClick,
}: {
  avatar: ReactNode
  title: string
  /** A coloured line under the title, e.g. "Therapist · Ongoing". */
  meta?: ReactNode
  preview: ReactNode
  time?: string
  badge?: ReactNode
  active: boolean
  /** The selected card's tint and ring (e.g. the team colour). */
  accent?: string
  onClick: () => void
}) {
  return (
    <li className="px-3 py-1">
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className="flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1 transition hover:bg-[#F7FAFA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
        style={active ? { background: `${accent}14`, ['--tw-ring-color' as string]: accent, boxShadow: `inset 0 0 0 1px ${accent}` } : { ['--tw-ring-color' as string]: C.line }}
      >
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-bold" style={{ color: C.text }}>
              {title}
            </span>
            {time && (
              <span className="shrink-0 text-xs font-semibold" style={{ color: C.meta }}>
                {time}
              </span>
            )}
          </span>
          {meta && <span className="truncate text-xs font-bold">{meta}</span>}
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="truncate text-sm" style={{ color: C.meta }}>
              {preview}
            </span>
            {badge}
          </span>
        </span>
      </button>
    </li>
  )
}

/* ---------- Conversation header ---------- */

export function ChatHeader({
  avatar,
  title,
  subtitle,
  onBack,
  actions,
  below,
}: {
  avatar: ReactNode
  title: string
  subtitle?: ReactNode
  onBack?: () => void
  actions?: ReactNode
  /** A strip under the header (e.g. the privacy note). */
  below?: ReactNode
}) {
  return (
    <header className="shrink-0 border-b px-3 py-3 sm:px-4" style={{ background: C.panel, borderColor: C.line }}>
      <div className="flex items-center gap-3">
        {onBack && (
          <button type="button" onClick={onBack} className="-ml-1 rounded-full p-2 md:hidden" style={{ color: C.meta }} aria-label="Back to chats">
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </button>
        )}
        {avatar}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold leading-tight" style={{ color: C.text }}>
            {title}
          </h2>
          {subtitle && (
            <p className="truncate text-xs" style={{ color: C.meta }}>
              {subtitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {below && <div className="mt-2.5">{below}</div>}
    </header>
  )
}

/** Round icon button for header actions. */
export function ChatIconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const cls = 'flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-mist'
  return href ? (
    <a href={href} className={cls} style={{ color: C.meta }} aria-label={label} title={label}>
      {children}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={cls} style={{ color: C.meta }} aria-label={label} title={label}>
      {children}
    </button>
  )
}

/* ---------- Messages ---------- */

export interface ChatMessageView {
  id: string
  mine: boolean
  content: string
  createdAt: string
  /** Shown above the first bubble of a group, e.g. "Another therapist" on a colleague's reply. */
  author?: string
  /** Own messages: sending → sent → delivered → read (“Seen”); or failed. Shown in words under the latest one. */
  state?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  error?: string
  onRetry?: () => void
  /** An attached image; `src` is null while its signed link is loading. */
  image?: { src: string | null }
  /** Their messages: a small avatar beside the last message of each group. */
  avatar?: ReactNode
}

const dayLabel = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  const sameYear = d.getFullYear() === today.getFullYear()
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })
}
export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** Messages from the same side within this long form one group (one time label). */
const GROUP_MS = 5 * 60_000

function statusWords(state: ChatMessageView['state'], readerName?: string) {
  if (state === 'sending') return 'Sending…'
  if (state === 'read') return readerName ? `Seen by ${readerName}` : 'Seen'
  if (state === 'delivered') return 'Delivered'
  if (state === 'sent') return 'Sent'
  return null
}

/**
 * Where an own message stands, from the other side's receipts (when they
 * last had our messages delivered / read).
 */
export function receiptState(createdAt: string, deliveredAt: string | null | undefined, readAt: string | null | undefined): 'sent' | 'delivered' | 'read' {
  const t = Date.parse(createdAt)
  if (readAt && Date.parse(readAt) >= t) return 'read'
  if (deliveredAt && Date.parse(deliveredAt) >= t) return 'delivered'
  return 'sent'
}

/**
 * The scrolling conversation. Keeps the newest message in view unless
 * the reader has scrolled up. `notice` sits at the top of the thread.
 * `readerName` turns the receipt under the latest own message into
 * "Seen by Ananya".
 */
export function MessageList({ messages, notice, empty, loading, readerName }: { messages: ChatMessageView[]; notice?: ReactNode; empty?: ReactNode; loading?: boolean; readerName?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastCount = useRef(0)
  const [viewing, setViewing] = useState<string | null>(null)

  // Jump to the bottom on first load and when new messages arrive while at the bottom.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const grew = messages.length > lastCount.current
    lastCount.current = messages.length
    const mineJustSent = grew && messages[messages.length - 1]?.mine
    if (stick.current || mineJustSent) el.scrollTop = el.scrollHeight
  }, [messages])

  const gutter = messages.some((m) => !m.mine && m.avatar)
  const lastMine = [...messages].reverse().find((m) => m.mine)?.id
  const sameGroup = (a: ChatMessageView | undefined, b: ChatMessageView | undefined) =>
    !!a && !!b && a.mine === b.mine && a.author === b.author && dayLabel(a.createdAt) === dayLabel(b.createdAt) && Math.abs(Date.parse(b.createdAt) - Date.parse(a.createdAt)) <= GROUP_MS

  let lastDay = ''
  return (
    <div
      ref={ref}
      onScroll={() => {
        const el = ref.current
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      }}
      className="relative flex-1 overflow-y-auto px-3 py-4 sm:px-[5%]"
      style={{ backgroundColor: C.soft }}
      aria-busy={loading}
    >
      {notice && <div className="mx-auto mb-3 max-w-xl">{notice}</div>}
      {loading ? (
        <div className="space-y-2" aria-label="Loading messages">
          <div className="ml-auto h-10 w-1/2 rounded-2xl bg-white motion-safe:animate-pulse" />
          <div className="h-14 w-2/3 rounded-2xl bg-white motion-safe:animate-pulse" />
          <div className="ml-auto h-10 w-2/5 rounded-2xl bg-white motion-safe:animate-pulse" />
        </div>
      ) : messages.length === 0 ? (
        empty
      ) : (
        <ol className="flex flex-col">
          {messages.map((m, i) => {
            const day = dayLabel(m.createdAt)
            const newDay = day !== lastDay
            lastDay = day
            const first = !sameGroup(messages[i - 1], m)
            const last = !sameGroup(m, messages[i + 1])
            const status = m.mine && m.id === lastMine && m.state !== 'failed' ? statusWords(m.state, readerName) : null
            return (
              <li key={m.id} className={first ? 'mt-3' : 'mt-1'}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold ring-1 ring-line" style={{ color: C.meta }}>
                      {day}
                    </span>
                  </div>
                )}
                {first && m.author && (
                  <p className={`mb-1 text-xs font-bold ${m.mine ? 'text-right' : gutter ? 'pl-10' : ''}`} style={{ color: C.meta }}>
                    {m.author}
                  </p>
                )}
                <div className={`flex items-end gap-2 ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  {!m.mine && gutter && <span className="w-8 shrink-0">{last && m.avatar}</span>}
                  <div
                    className={`max-w-[82%] rounded-2xl text-[15px] leading-relaxed sm:max-w-[65%] ${m.image ? 'p-1' : 'px-3.5 py-2.5'} ${last ? (m.mine ? 'rounded-br-md' : 'rounded-bl-md') : ''} ${m.mine ? '' : 'shadow-[0_1px_2px_rgba(15,47,55,.06)] ring-1 ring-line'}`}
                    style={{ background: m.mine ? C.outgoing : '#FFFFFF', color: m.mine ? '#FFFFFF' : C.text }}
                  >
                    <span className="sr-only">{m.mine ? 'You' : (m.author ?? 'They')}: </span>
                    {m.image && (
                      <button
                        type="button"
                        onClick={() => m.image?.src && setViewing(m.image.src)}
                        disabled={!m.image.src}
                        className="block overflow-hidden rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                        aria-label="Open the attached image"
                      >
                        {m.image.src ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed links to a private bucket; next/image can't optimise them
                          <img src={m.image.src} alt="Attached image" loading="lazy" className="block max-h-[320px] w-full min-w-[160px] max-w-[300px] bg-black/5 object-cover" />
                        ) : (
                          <span className="flex h-48 w-[240px] items-center justify-center bg-black/5" aria-label="Loading image">
                            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                          </span>
                        )}
                      </button>
                    )}
                    {m.content && <span className={`whitespace-pre-wrap break-words ${m.image ? 'block px-2.5 pb-1.5 pt-1.5' : ''}`}>{m.content}</span>}
                  </div>
                </div>
                {(last || status) && m.state !== 'failed' && (
                  <p className={`mt-1 text-[11px] font-semibold ${m.mine ? 'text-right' : gutter ? 'pl-10' : ''}`} style={{ color: C.meta }}>
                    <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                    {status && <> · {status}</>}
                  </p>
                )}
                {m.state === 'failed' && (
                  <p role="alert" className="mt-1 flex items-center justify-end gap-1 text-right text-xs font-semibold text-[#C42B1C]">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden />
                    Not sent{m.error ? `: ${m.error}` : ''}.{' '}
                    {m.onRetry && (
                      <button type="button" onClick={m.onRetry} className="underline underline-offset-2">
                        Retry
                      </button>
                    )}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <ImageViewer src={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

/** Full-screen view of a chat image (native <dialog>: Esc and the ✕ close it). */
function ImageViewer({ src, onClose }: { src: string | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (src && !d.open) d.showModal()
    if (!src && d.open) d.close()
  }, [src])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Image"
      className="m-0 h-full max-h-none w-full max-w-none bg-[#0B141A]/95 p-0 backdrop:bg-black/60"
    >
      {src && (
        <div className="flex h-full w-full items-center justify-center p-4" onClick={onClose}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed link to a private bucket */}
          <img src={src} alt="Attached image, full size" className="max-h-full max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Close image">
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>
      )}
    </dialog>
  )
}

/** A compact note at the top of a conversation (privacy, reply times). */
export function ChatNotice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed" style={{ background: C.mist, color: C.meta }}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="text-left">{children}</div>
    </div>
  )
}

/** A small centred milestone in the thread, e.g. "Conversation started · 12 Oct". */
export function ChatSystemNote({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto w-fit max-w-full rounded-full bg-white px-3 py-1 text-center text-[11px] font-semibold ring-1 ring-line" style={{ color: C.meta }}>
      {children}
    </p>
  )
}

/* ---------- Composer ---------- */

/**
 * A soft input with a labelled Send button. Enter sends and Shift+Enter adds a
 * line on computers; on touch screens Enter adds a line and the button sends.
 */
export function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Type a message',
  maxLength,
  footer,
  attachment,
  onAttach,
  onRemoveAttachment,
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  maxLength: number
  footer?: ReactNode
  /** A chosen image waiting to be sent (its text becomes the optional caption). */
  attachment?: { previewUrl: string; preparing?: boolean; note?: string } | null
  /** Enables the attach button; called with the picked (or pasted) file. */
  onAttach?: (file: File) => void
  onRemoveAttachment?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const remaining = maxLength - value.trim().length

  // Grow with the text, up to about six lines.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSend()
    }
  }

  // Pasting an image (e.g. a screenshot) attaches it.
  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    if (!onAttach) return
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      onAttach(file)
    }
  }

  const hasImage = !!attachment && !attachment.preparing
  const canSend = (!!value.trim() || hasImage) && remaining >= 0 && !disabled && !attachment?.preparing
  return (
    <div className="shrink-0 border-t px-3 py-3" style={{ background: C.panel, borderColor: C.line }}>
      {attachment && (
        <div className="mb-2 flex items-center gap-3 rounded-2xl p-2 ring-1 ring-line" style={{ background: C.soft }}>
          <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-black/5">
            {attachment.preparing ? (
              <span className="flex h-full w-full items-center justify-center" aria-label="Preparing image">
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.meta }} aria-hidden />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
              <img src={attachment.previewUrl} alt="Image to send" className="h-full w-full object-cover" />
            )}
          </span>
          <span className="min-w-0 flex-1 text-sm" style={{ color: C.meta }}>
            {attachment.preparing ? (
              'Compressing image…'
            ) : (
              <>
                {attachment.note && <span className="block font-semibold" style={{ color: C.text }}>{attachment.note}</span>}
                Add a caption if you like, then send.
              </>
            )}
          </span>
          {onRemoveAttachment && (
            <button type="button" onClick={onRemoveAttachment} className="rounded-full p-2 hover:bg-mist" style={{ color: C.meta }} aria-label="Remove image">
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) onAttach(f)
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={disabled}
              className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full transition hover:bg-mist disabled:opacity-40"
              style={{ color: C.meta }}
              aria-label="Attach image"
              title="Attach image"
            >
              <ImagePlus className="h-6 w-6" aria-hidden />
            </button>
          </>
        )}
        <label htmlFor={id} className="sr-only">
          {placeholder}
        </label>
        <textarea
          id={id}
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={attachment ? 'Add a caption (optional)' : placeholder}
          disabled={disabled}
          maxLength={maxLength + 200}
          className="max-h-[140px] min-h-[44px] flex-1 resize-none rounded-2xl px-3.5 py-2.5 text-[15px] leading-snug outline-none ring-tide-600 placeholder:text-[#557178] focus:ring-2 disabled:opacity-60"
          style={{ color: C.text, background: C.mist }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="flex h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-sm font-bold text-white transition disabled:opacity-40"
          style={{ background: C.accent }}
        >
          <span className="max-sm:sr-only">Send</span>
          <SendHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
      {(remaining < 300 || footer) && (
        <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-xs" style={{ color: C.meta }}>
          <span>{footer}</span>
          {remaining < 300 && <span className={remaining < 0 ? 'font-bold text-[#C42B1C]' : ''}>{remaining.toLocaleString()} characters left</span>}
        </div>
      )}
    </div>
  )
}

export const CHAT_COLORS = C
