import { MessageCircleHeart } from 'lucide-react'

/**
 * One chat bubble. "mine" sits on the right in dark ink; "theirs" on the left
 * in white, with a visible name. Both inboxes use it: employees see their own
 * messages as "mine", therapists see theirs as "mine".
 */
export function Bubble({
  side,
  label,
  meta,
  accent = '#7C6BD6',
  children,
}: {
  side: 'mine' | 'theirs'
  /** Who sent it; shown above "theirs" bubbles and read out for both. */
  label: string
  meta: React.ReactNode
  /** Colour of the icon beside the sender's name. */
  accent?: string
  children: React.ReactNode
}) {
  const mine = side === 'mine'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        {!mine && (
          <span className="mb-1 flex items-center gap-1.5 text-xs font-bold text-muted">
            <MessageCircleHeart className="h-3.5 w-3.5" style={{ color: accent }} aria-hidden />
            {label}
          </span>
        )}
        <div
          className={`whitespace-pre-wrap break-words rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed ${
            mine ? 'rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-white text-ink ring-1 ring-line'
          }`}
        >
          <span className="sr-only">{label}: </span>
          {children}
        </div>
        <span className="mt-1 text-[11px] text-muted">{meta}</span>
      </div>
    </div>
  )
}
