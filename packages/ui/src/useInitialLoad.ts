'use client'

import { useEffect, useRef } from 'react'
import type { ActionResult } from '@rajs8952/core/types'
import { useTrackLoad } from './storage'

/**
 * A tracker's first load, from one of two sources:
 *  - initialData undefined → the tracker is standalone and calls `load` itself;
 *  - initialData null      → a parent (the dashboard) is fetching it; wait;
 *  - initialData set       → use what the parent fetched.
 * `apply` runs once per result; later changes are the tracker's own state.
 */
export function useInitialLoad<T>(
  initialData: ActionResult<T> | null | undefined,
  load: () => Promise<ActionResult<T>>,
  apply: (res: ActionResult<T>) => void,
) {
  const trackLoad = useTrackLoad()
  const latest = useRef({ load, apply, trackLoad })
  latest.current = { load, apply, trackLoad }

  useEffect(() => {
    if (initialData === null) return
    if (initialData !== undefined) {
      latest.current.apply(initialData)
      return
    }
    let alive = true
    latest.current.trackLoad(latest.current.load()).then((res) => {
      if (alive) latest.current.apply(res)
    })
    return () => {
      alive = false
    }
  }, [initialData])
}
