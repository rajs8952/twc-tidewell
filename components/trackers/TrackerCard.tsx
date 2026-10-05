'use client'

import { Component, type ReactNode } from 'react'
import type { TrackerModule } from '@/lib/trackers'

/** Shared card frame: icon tile, name and the tracker's own content. */
export function TrackerCard({
  tracker,
  className = '',
  children,
}: {
  tracker: TrackerModule
  className?: string
  children: ReactNode
}) {
  const Icon = tracker.icon
  return (
    <section
      aria-labelledby={`tracker-${tracker.id}`}
      className={`rounded-3xl bg-white/60 p-4 ring-1 ring-line sm:p-6 ${className}`}
    >
      <header className="mb-4 flex items-center gap-3 sm:mb-6">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: tracker.accent }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <h2 id={`tracker-${tracker.id}`} className="text-lg font-bold">
          {tracker.name}
        </h2>
      </header>
      {children}
    </section>
  )
}

/** Card for a module that hasn't shipped yet. */
export function PlaceholderCard({ tracker, className = '' }: { tracker: TrackerModule; className?: string }) {
  const Icon = tracker.icon
  return (
    <section
      aria-labelledby={`tracker-${tracker.id}`}
      className={`flex flex-col rounded-3xl border-2 border-dashed border-line bg-white/40 p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `${tracker.accent}1A`, color: tracker.accent }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-bold text-muted">Coming soon</span>
      </div>
      <h2 id={`tracker-${tracker.id}`} className="mt-4 text-lg font-bold">
        {tracker.name}
      </h2>
      <p className="mt-1 text-sm text-muted">{tracker.description}</p>
    </section>
  )
}

/**
 * Keeps one tracker's crash inside its own card, so a bug in a new
 * module can never take the water tracker (or the page) down with it.
 */
export class TrackerBoundary extends Component<
  { name: string; className?: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.name} tracker]`, error)
  }

  render() {
    if (this.state.failed) {
      return (
        <section role="alert" className={`notice-error rounded-3xl ${this.props.className ?? ''}`}>
          The {this.props.name} tracker hit a problem and was paused. Reload the page to try again.
        </section>
      )
    }
    return this.props.children
  }
}
