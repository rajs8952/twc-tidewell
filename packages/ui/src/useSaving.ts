'use client'

import { useCallback, useState } from 'react'

/**
 * `saving` stays true while any started save is running. Works on React 18
 * and 19 (an async useTransition needs 19). A save that throws is re-thrown
 * during render, so the nearest error boundary shows it.
 */
export function useSaving(): [saving: boolean, start: (save: () => Promise<void>) => void] {
  const [running, setRunning] = useState(0)
  const [, setFailure] = useState<unknown>(null)

  const start = useCallback((save: () => Promise<void>) => {
    setRunning((n) => n + 1)
    save()
      .catch((e) =>
        setFailure(() => {
          throw e
        }),
      )
      .finally(() => setRunning((n) => n - 1))
  }, [])

  return [running > 0, start]
}
