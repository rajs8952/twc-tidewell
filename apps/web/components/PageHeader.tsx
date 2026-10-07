import type { LucideIcon } from 'lucide-react'

/** Title block shared by the tracker and insights pages. */
export function PageHeader({
  title,
  description,
  icon: Icon,
  accent,
  actions,
}: {
  title: string
  description: string
  icon: LucideIcon
  accent: string
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white sm:h-14 sm:w-14" style={{ background: accent }}>
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
          <p className="mt-0.5 text-muted">{description}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}
