'use client'

import { createContext, useContext, useMemo } from 'react'
import type { TrackerStorage } from '@omniwell/core/storage'

type TrackLoad = <T>(promise: Promise<T>) => Promise<T>

const passThrough: TrackLoad = (promise) => promise

const TrackerStorageContext = createContext<{ storage: TrackerStorage; trackLoad: TrackLoad } | null>(null)

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

function useTrackerContext() {
  const ctx = useContext(TrackerStorageContext)
  if (!ctx) throw new Error('Trackers need a <TrackerStorageProvider> above them.')
  return ctx
}

export const useTrackerStorage = (): TrackerStorage => useTrackerContext().storage
export const useTrackLoad = (): TrackLoad => useTrackerContext().trackLoad
