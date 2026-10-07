import type { LucideIcon } from 'lucide-react'

/** A titled card that groups one part of the Profile page. */
export function ProfileSection({
  id,
  title,
  description,
  icon: Icon,
  accent,
  children,
  className = '',
}: {
  id: string
  title: string
  description?: string
  icon: LucideIcon
  accent: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6 ${className}`}>
      <div className="mb-5 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: accent }}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-extrabold leading-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
