import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readCache, saveCache } from './cache'
import { messageOf } from './trackers'

/**
 * Loads a screen's data when it comes into view (so going back to Home
 * after logging shows the new entry), and on pull-to-refresh.
 * `set` lets a screen update the data after saving, without reloading.
 *
 * With `cacheName`, the last good result is kept on the phone (lib/cache.ts):
 * it's shown straight away while loading, and kept when loading fails (no
 * connection); `savedAt` then says how old it is.
 */
export function useLoad<T>(load: () => Promise<T>, cacheName?: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  /** When the data shown was saved, if it's the copy on the phone rather than fresh. */
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const latest = useRef(load)
  useEffect(() => {
    latest.current = load
  })
  const hasData = useRef(false)

  const run = useCallback(
    async (pulled = false) => {
      if (pulled) setRefreshing(true)
      // First time: the saved copy, while the fresh one loads.
      if (cacheName && !hasData.current) {
        const cached = await readCache<T>(cacheName)
        if (cached && !hasData.current) {
          setData(cached.data)
          setSavedAt(cached.at)
        }
      }
      try {
        const fresh = await latest.current()
        hasData.current = true
        setData(fresh)
        setSavedAt(null)
        setError(null)
        if (cacheName) void saveCache(cacheName, fresh)
      } catch (e) {
        const cached = cacheName ? await readCache<T>(cacheName) : null
        if (cached) {
          setData(cached.data)
          setSavedAt(cached.at)
          setError(null)
        } else {
          setError(messageOf(e))
        }
      } finally {
        setRefreshing(false)
      }
    },
    [cacheName],
  )

  useFocusEffect(
    useCallback(() => {
      void run()
    }, [run]),
  )

  return { data, set: setData, error, savedAt, refreshing, refresh: () => void run(true), reload: () => run() }
}
