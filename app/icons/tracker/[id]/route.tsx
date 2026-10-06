import { ImageResponse } from 'next/og'
import { Children, cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { TRACKERS } from '@/lib/trackers'

/**
 * ImageResponse only draws plain elements, while Lucide icons are wrapper
 * components (forwardRef). This expands them into the <svg>/<path>
 * elements they'd render.
 */
function plain(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node
  const el = node as ReactElement<{ children?: ReactNode }>
  const type = el.type as unknown
  if (typeof type === 'object' && type && 'render' in type) return plain((type as { render: (p: object, r: null) => ReactNode }).render(el.props, null))
  if (typeof type === 'function') return plain((type as (p: object) => ReactNode)(el.props))
  return el.props.children === undefined ? el : cloneElement(el, undefined, ...Children.toArray(el.props.children).map(plain))
}

/** A tracker's notification icon (192×192): its symbol in white on its colour, e.g. /icons/tracker/water. */
export function GET(_req: Request, { params }: { params: { id: string } }) {
  const t = TRACKERS.find((x) => x.id === params.id)
  if (!t) return new Response('Not found', { status: 404 })
  return new ImageResponse(
    (
      <div style={{ width: 192, height: 192, display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.accent, borderRadius: 44 }}>
        {plain(createElement(t.icon, { size: 112, color: '#FFFFFF', strokeWidth: 2 }))}
      </div>
    ),
    { width: 192, height: 192, headers: { 'Cache-Control': 'public, max-age=86400, immutable' } },
  )
}
