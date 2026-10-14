import { useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { messageOf } from './trackers'

/**
 * Loads a screen's data when it comes into view (so going back to Home
 * after logging shows the new entry), and on pull-to-refresh.
 * `set` lets a screen update the data after saving, without reloading.
 */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const latest = useRef(load)
  useEffect(() => {
    latest.current = load
  })

  const run = useCallback(async (pulled = false) => {
    if (pulled) setRefreshing(true)
    try {
      setData(await latest.current())
      setError(null)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void run()
    }, [run]),
  )

  return { data, set: setData, error, refreshing, refresh: () => void run(true), reload: () => run() }
}
