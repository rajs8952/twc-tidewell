'use client'

import { Component, type ReactNode } from 'react'

/**
 * Keeps one tracker's crash inside its own area, so a bug in one module
 * can't take the page (or the navigation) down with it.
 */
export class TrackerBoundary extends Component<{ name: string; className?: string; children: ReactNode }, { failed: boolean }> {
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
        <section role="alert" className={`omni-notice-error rounded-3xl ${this.props.className ?? ''}`}>
          The {this.props.name} tracker hit a problem and was paused. Reload the page to try again.
        </section>
      )
    }
    return this.props.children
  }
}
