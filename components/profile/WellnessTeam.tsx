import { Clock, ExternalLink, Mail, Phone, LifeBuoy } from 'lucide-react'
import { WELLNESS_TEAM, type WellnessContact } from '@/lib/wellness-team'

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

function ContactCard({ contact }: { contact: WellnessContact }) {
  const Icon = contact.icon
  const hasDetails = Boolean(contact.phone || contact.email || contact.url)
  const linkClass =
    'inline-flex min-h-[44px] items-center gap-2 rounded-2xl px-3 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-mist hover:ring-ink/20'

  return (
    <li className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${contact.accent}1F`, color: contact.accent }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold leading-tight">{contact.name}</h3>
          <p className="mt-0.5 text-sm text-muted">{contact.description}</p>
        </div>
      </div>

      {hasDetails ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {contact.phone && (
            <a href={telHref(contact.phone)} className={linkClass}>
              <Phone className="h-4 w-4" aria-hidden />
              {contact.phone}
            </a>
          )}
          {contact.email && (
            <a href={`mailto:${contact.email}`} className={linkClass}>
              <Mail className="h-4 w-4" aria-hidden />
              Email
            </a>
          )}
          {contact.url && (
            <a href={contact.url} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <ExternalLink className="h-4 w-4" aria-hidden />
              Book
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-xl bg-mist/70 px-3 py-2 text-sm text-muted">Details coming soon. Ask HR in the meantime.</p>
      )}
      {contact.hours && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          {contact.hours}
        </p>
      )}
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
      <p className="mt-4 flex items-start gap-2 text-sm text-muted">
        <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-ink" aria-hidden />
        <span>If you’re in immediate danger or thinking about harming yourself, call your local emergency number now.</span>
      </p>
    </>
  )
}
