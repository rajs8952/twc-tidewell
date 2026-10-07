'use client'

import { createContext, useContext, useMemo, useRef } from 'react'
import type { TrackerStorage } from '@rajs8952/core/storage'

type TrackLoad = <T>(promise: Promise<T>) => Promise<T>

const passThrough: TrackLoad = (promise) => promise

const TrackerStorageContext = createContext<{ storage: TrackerStorage | null; trackLoad: TrackLoad }>({
  storage: null,
  trackLoad: passThrough,
})

/**
 * Supplies the data layer every tracker below it reads and writes through.
 * `trackLoad` wraps each tracker's first load, e.g. to drive a page-level progress bar.
 */
export function TrackerStorageProvider({
  storage,
  trackLoad = passThrough,
  children,
}: {
  storage: TrackerStorage
  trackLoad?: TrackLoad
  children: React.ReactNode
}) {
  const value = useMemo(() => ({ storage, trackLoad }), [storage, trackLoad])
  return <TrackerStorageContext.Provider value={value}>{children}</TrackerStorageContext.Provider>
}

/** The provider's storage. Throws without a <TrackerStorageProvider>. */
export function useTrackerStorage(): TrackerStorage {
  const { storage } = useContext(TrackerStorageContext)
  if (!storage) throw new Error('Trackers need a <TrackerStorageProvider> above them.')
  return storage
}

export const useTrackLoad = (): TrackLoad => useContext(TrackerStorageContext).trackLoad

/**
 * One tracker's store: the `adapter` passed to the tracker, else the
 * provider's. The returned object keeps its identity across renders and
 * always calls the latest adapter, so an adapter written inline in JSX
 * doesn't reload the tracker on every render. To load from a different
 * adapter, remount the tracker (e.g. give it a new `key`).
 */
export function useStore<K extends keyof TrackerStorage>(key: K, adapter?: TrackerStorage[K]): TrackerStorage[K] {
  const { storage } = useContext(TrackerStorageContext)
  const store = adapter ?? storage?.[key]
  if (!store) throw new Error(`Pass an adapter to this tracker or put a <TrackerStorageProvider> above it.`)
  const latest = useRef(store)
  latest.current = store
  return useMemo(() => {
    const methods = Object.keys(latest.current) as (keyof TrackerStorage[K])[]
    return Object.fromEntries(
      methods.map((m) => [m, (...args: unknown[]) => (latest.current[m] as (...a: unknown[]) => unknown)(...args)]),
    ) as unknown as TrackerStorage[K]
  }, [])
}
