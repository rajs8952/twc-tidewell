import { ChevronRight, Clock, ExternalLink, LifeBuoy, Mail, MessageCircleHeart, Phone, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { EMERGENCY_NUMBER, WELLNESS_TEAM, telHref, type WellnessContact } from '@/lib/wellness-team'

/**
 * One full-width action row. Every card uses the same rows, stacked at the
 * bottom, so the three cards line up however many contact details each has.
 */
function Action({
  href,
  icon: Icon,
  label,
  detail,
  primary,
  accent,
  external,
}: {
  href: string
  icon: LucideIcon
  label: string
  /** Shown under the label, e.g. the number or address. */
  detail?: string
  primary?: boolean
  accent: string
  external?: boolean
}) {
  const className = `flex min-h-[44px] w-full items-center gap-2.5 rounded-2xl px-3.5 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
    primary ? 'text-white hover:opacity-90' : 'bg-white text-ink ring-1 ring-line hover:bg-mist hover:ring-ink/20'
  }`
  const style = primary ? { background: accent, outlineColor: accent } : undefined
  const body = (
    <>
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 py-2 leading-tight">
        <span className="block">{label}</span>
        {detail && <span className={`block break-all text-xs font-semibold ${primary ? 'text-white/85' : 'text-muted'}`}>{detail}</span>}
      </span>
      {primary && <ChevronRight className="ml-auto h-4 w-4 shrink-0" aria-hidden />}
      {external && <span className="sr-only">(opens in a new tab)</span>}
    </>
  )
  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className} style={style}>
        {body}
      </Link>
    )
  }
  return (
    <a href={href} className={className} style={style} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {body}
    </a>
  )
}

/**
 * Teams with a secure inbox, and the filled button's colour: a deeper step of
 * each team's accent so white text clears 4.5:1 (purple 5.6:1, orange 5.1:1).
 */
const CHAT: Partial<Record<WellnessContact['id'], { href: string; label: string; bg: string }>> = {
  therapist: { href: '/messages/therapist', label: 'Talk to Therapist', bg: '#6A55C9' },
  dietitian: { href: '/messages/dietitian', label: 'Talk to Dietitian', bg: '#A85A0B' },
}

function ContactCard({ contact }: { contact: WellnessContact }) {
  const Icon = contact.icon
  const chat = CHAT[contact.id]
  const hasDetails = Boolean(contact.phone || contact.email || contact.url)

  return (
    <li className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `${contact.accent}1F`, color: contact.accent }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h3 className="font-bold leading-snug">{contact.name}</h3>
      </div>
      <p className="mt-3 text-sm text-muted">{contact.description}</p>
      {contact.hours && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {contact.hours}
        </p>
      )}

      {/* mt-auto pins the actions to the bottom so all three cards line up. */}
      <div className="mt-auto space-y-2 pt-4">
        {chat && <Action href={chat.href} icon={MessageCircleHeart} label={chat.label} primary accent={chat.bg} />}
        {hasDetails ? (
          <>
            {contact.phone && <Action href={telHref(contact.phone)} icon={Phone} label="Call" detail={contact.phone} accent={contact.accent} />}
            {contact.email && <Action href={`mailto:${contact.email}`} icon={Mail} label="Email" detail={contact.email} accent={contact.accent} />}
            {contact.url && <Action href={contact.url} icon={ExternalLink} label="Book online" accent={contact.accent} external />}
          </>
        ) : (
          <p className="rounded-2xl bg-mist/70 px-3.5 py-3 text-sm text-muted">Details coming soon. Ask HR in the meantime.</p>
        )}
      </div>
    </li>
  )
}

/** Static list of the company's EAP, therapist and dietitian (edit lib/wellness-team.ts). */
export function WellnessTeam() {
  return (
    <>
      <ul className="grid gap-3 md:grid-cols-3">
        {WELLNESS_TEAM.map((c) => (
          <ContactCard key={c.id} contact={c} />
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-mist/60 px-4 py-3 text-sm text-ink">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          If you’re in immediate danger or thinking about harming yourself, call{' '}
          {EMERGENCY_NUMBER ? (
            <a href={telHref(EMERGENCY_NUMBER)} className="font-bold underline underline-offset-2">
              {EMERGENCY_NUMBER}
            </a>
          ) : (
            'your local emergency number'
          )}{' '}
          now.
        </span>
      </p>
    </>
  )
}
