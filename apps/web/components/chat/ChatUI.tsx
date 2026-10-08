'use client'

import { AlertCircle, ArrowLeft, Check, Clock, Lock, Search, SendHorizontal, type LucideIcon } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

/* ------------------------------------------------------------------
 * Chat building blocks in a WhatsApp Web style, shared by the employee
 * inbox (components/messages/SecureInbox.tsx) and the staff portal
 * (components/therapist/TherapistPortal.tsx):
 *   ChatFrame     two panes: chat list | conversation (one at a time on phones)
 *   ChatList*     list header, search and rows
 *   ChatHeader    the conversation's top bar
 *   MessageList   patterned wallpaper, date chips, bubbles with time and ticks
 *   Composer      pill input with a round send button
 * Colours keep text at 4.5:1 or more against its background.
 * ------------------------------------------------------------------ */

const C = {
  panel: '#F0F2F5',
  line: '#E9EDEF',
  wallpaper: '#EFEAE2',
  outgoing: '#D9FDD3',
  text: '#111B21',
  meta: '#54656F',
  accent: '#008069',
}

/* ---------- Frame ---------- */

export function ChatFrame({ sidebar, main, showMain, className = '' }: { sidebar: ReactNode; main: ReactNode; showMain: boolean; className?: string }) {
  return (
    <div className={`flex overflow-hidden rounded-2xl bg-white shadow-[0_6px_24px_-12px_rgba(11,20,26,0.35)] ring-1 ring-black/5 ${className}`}>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 border-b-[6px] px-8 text-center" style={{ background: '#F8F9FA', borderColor: C.accent }}>
      <span className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: C.panel, color: C.meta }}>
        <Icon className="h-9 w-9" aria-hidden />
      </span>
      <p className="text-2xl font-light" style={{ color: C.text }}>
        {title}
      </p>
      <div className="max-w-md text-sm" style={{ color: C.meta }}>
        {children}
      </div>
    </div>
  )
}

/* ---------- Avatars ---------- */

export function ChatAvatar({ color, icon: Icon, initials, size = 'md' }: { color: string; icon?: LucideIcon; initials?: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-10 w-10 text-sm' : 'h-12 w-12 text-base'
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${box}`} style={{ background: color }} aria-hidden>
      {Icon ? <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'} /> : initials}
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
    <div className="flex h-[60px] shrink-0 items-center justify-between gap-2 px-4" style={{ background: C.panel }}>
      <h2 className="text-lg font-bold" style={{ color: C.text }}>
        {title}
      </h2>
      <div className="flex items-center gap-1">{actions}</div>
    </div>
  )
}

export function ChatSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const id = useId()
  return (
    <div className="shrink-0 border-b px-3 py-2" style={{ borderColor: C.line }}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="flex items-center gap-3 rounded-lg px-3" style={{ background: C.panel }}>
        <Search className="h-4 w-4 shrink-0" style={{ color: C.meta }} aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-[#54656F]"
          style={{ color: C.text }}
        />
      </div>
    </div>
  )
}

/** Filter chips under the search box, like WhatsApp's All / Unread. */
export function ChatFilters<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; count?: number }[]; onChange: (v: T) => void }) {
  return (
    <div role="tablist" aria-label="Filter conversations" className="flex shrink-0 gap-2 overflow-x-auto px-3 py-2">
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
            style={on ? { background: '#D9FDD3', color: '#0A5C4A' } : { background: C.panel, color: C.meta }}
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
  preview,
  time,
  badge,
  active,
  onClick,
}: {
  avatar: ReactNode
  title: string
  preview: ReactNode
  time?: string
  badge?: ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className="flex w-full items-center gap-3 px-3 text-left transition hover:bg-[#F5F6F6] focus-visible:bg-[#F5F6F6] focus-visible:outline-none"
        style={active ? { background: C.panel } : undefined}
      >
        {avatar}
        <span className="flex min-w-0 flex-1 flex-col border-b py-3" style={{ borderColor: C.line }}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[15px] font-semibold" style={{ color: C.text }}>
              {title}
            </span>
            {time && (
              <span className="shrink-0 text-xs" style={{ color: C.meta }}>
                {time}
              </span>
            )}
          </span>
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

export function ChatHeader({ avatar, title, subtitle, onBack, actions }: { avatar: ReactNode; title: string; subtitle?: ReactNode; onBack?: () => void; actions?: ReactNode }) {
  return (
    <header className="flex h-[60px] shrink-0 items-center gap-3 px-3 sm:px-4" style={{ background: C.panel }}>
      {onBack && (
        <button type="button" onClick={onBack} className="-ml-1 rounded-full p-2 md:hidden" style={{ color: C.meta }} aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      {avatar}
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-base font-semibold leading-tight" style={{ color: C.text }}>
          {title}
        </h2>
        {subtitle && (
          <p className="truncate text-xs" style={{ color: C.meta }}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </header>
  )
}

/** Round icon button for header actions. */
export function ChatIconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  const cls = 'flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-black/5'
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
  state?: 'sent' | 'sending' | 'failed'
  error?: string
  onRetry?: () => void
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

/** Messages from the same side within this long share one tail. */
const GROUP_MS = 5 * 60_000

/** The small curved tail on the first bubble of a group. */
function Tail({ mine }: { mine: boolean }) {
  return (
    <svg viewBox="0 0 8 13" width="8" height="13" aria-hidden className={`absolute top-0 ${mine ? '-right-2' : '-left-2 -scale-x-100'}`}>
      <path d="M0 0h8L1.5 9.4A2 2 0 0 1 0 8.8z" fill={mine ? C.outgoing : '#FFFFFF'} />
    </svg>
  )
}

function Ticks({ state }: { state: ChatMessageView['state'] }) {
  if (state === 'sending') return <Clock className="h-3.5 w-3.5" aria-label="Sending" />
  if (state === 'failed') return <AlertCircle className="h-3.5 w-3.5 text-[#C42B1C]" aria-label="Not sent" />
  return <Check className="h-3.5 w-3.5" aria-label="Sent" />
}

/**
 * The scrolling conversation. Keeps the newest message in view unless
 * the reader has scrolled up. `notice` is the yellow chip pinned at the top.
 */
export function MessageList({ messages, notice, empty, loading }: { messages: ChatMessageView[]; notice?: ReactNode; empty?: ReactNode; loading?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const lastCount = useRef(0)

  // Jump to the bottom on first load and when new messages arrive while at the bottom.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const grew = messages.length > lastCount.current
    lastCount.current = messages.length
    const mineJustSent = grew && messages[messages.length - 1]?.mine
    if (stick.current || mineJustSent) el.scrollTop = el.scrollHeight
  }, [messages])

  let lastDay = ''
  return (
    <div
      ref={ref}
      onScroll={() => {
        const el = ref.current
        if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
      }}
      className="relative flex-1 overflow-y-auto px-[4%] py-3 sm:px-[6%]"
      style={{
        backgroundColor: C.wallpaper,
        // A faint dotted texture in the spirit of WhatsApp's wallpaper (no image needed).
        backgroundImage: 'radial-gradient(rgba(84,101,111,0.09) 1px, transparent 1.2px), radial-gradient(rgba(84,101,111,0.06) 1px, transparent 1.2px)',
        backgroundSize: '22px 22px, 22px 22px',
        backgroundPosition: '0 0, 11px 11px',
      }}
      aria-busy={loading}
    >
      {notice && <div className="mx-auto mb-3 mt-1 max-w-xl">{notice}</div>}
      {loading ? (
        <div className="space-y-2" aria-label="Loading messages">
          <div className="ml-auto h-10 w-1/2 rounded-lg bg-white/70 motion-safe:animate-pulse" />
          <div className="h-14 w-2/3 rounded-lg bg-white/70 motion-safe:animate-pulse" />
          <div className="ml-auto h-10 w-2/5 rounded-lg bg-white/70 motion-safe:animate-pulse" />
        </div>
      ) : messages.length === 0 ? (
        empty
      ) : (
        <ol className="flex flex-col">
          {messages.map((m, i) => {
            const prev = messages[i - 1]
            const day = dayLabel(m.createdAt)
            const newDay = day !== lastDay
            lastDay = day
            const first = newDay || !prev || prev.mine !== m.mine || prev.author !== m.author || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > GROUP_MS
            return (
              <li key={m.id} className={first ? 'mt-3' : 'mt-0.5'}>
                {newDay && (
                  <div className="my-2 flex justify-center">
                    <span className="rounded-lg bg-white px-3 py-1 text-xs font-medium uppercase tracking-wide shadow-sm" style={{ color: C.meta }}>
                      {day}
                    </span>
                  </div>
                )}
                <div className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`relative max-w-[85%] rounded-lg px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-[1.35] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] sm:max-w-[65%] ${first ? (m.mine ? 'rounded-tr-none' : 'rounded-tl-none') : ''}`}
                    style={{ background: m.mine ? C.outgoing : '#FFFFFF', color: C.text }}
                  >
                    {first && <Tail mine={m.mine} />}
                    {first && m.author && (
                      <p className="mb-0.5 text-xs font-semibold" style={{ color: C.accent }}>
                        {m.author}
                      </p>
                    )}
                    <span className="sr-only">{m.mine ? 'You' : (m.author ?? 'They')}: </span>
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    {/* Invisible spacer so the time never overlaps the last line of text. */}
                    <span className="inline-block w-[72px]" aria-hidden />
                    <span className="absolute bottom-1 right-2 flex items-center gap-1 text-[11px]" style={{ color: C.meta }}>
                      <time dateTime={m.createdAt}>{timeLabel(m.createdAt)}</time>
                      {m.mine && <Ticks state={m.state} />}
                    </span>
                  </div>
                </div>
                {m.state === 'failed' && (
                  <p role="alert" className="mt-1 text-right text-xs font-semibold text-[#C42B1C]">
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
    </div>
  )
}

/** The pale yellow chip at the top of a conversation (like WhatsApp's encryption notice). */
export function ChatNotice({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="flex gap-2 rounded-lg px-3 py-2 text-center text-xs leading-relaxed shadow-sm" style={{ background: '#FFEECD', color: '#3B4A54' }}>
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="text-left">{children}</p>
    </div>
  )
}

/* ---------- Composer ---------- */

/**
 * Pill input with a round send button. Enter sends and Shift+Enter adds a
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
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  maxLength: number
  footer?: ReactNode
}) {
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
      if (value.trim() && remaining >= 0 && !disabled) onSend()
    }
  }

  const canSend = !!value.trim() && remaining >= 0 && !disabled
  return (
    <div className="shrink-0 px-3 py-2.5" style={{ background: C.panel }}>
      <div className="flex items-end gap-2">
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
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength + 200}
          className="max-h-[140px] min-h-[42px] flex-1 resize-none rounded-lg bg-white px-3 py-2.5 text-[15px] leading-snug outline-none placeholder:text-[#54656F] disabled:opacity-60"
          style={{ color: C.text }}
        />
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          aria-label="Send"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-40"
          style={{ background: C.accent }}
        >
          <SendHorizontal className="h-5 w-5" aria-hidden />
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
