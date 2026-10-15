import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * What each screen last loaded, kept on this phone so the app still shows
 * something without a connection (Home, the trackers, Chats, Support).
 * Stored per signed-in person and cleared when they sign out, so a shared
 * phone never shows someone else's data. The app's own storage is
 * encrypted by the phone while it's locked.
 * ------------------------------------------------------------------ */

const PREFIX = 'omniwell.cache.'

async function keyFor(name: string) {
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user.id
  return user ? `${PREFIX}${user}.${name}` : null
}

export interface Cached<T> {
  data: T
  /** When it was saved (ms). */
  at: number
}

export async function saveCache<T>(name: string, data: T) {
  try {
    const key = await keyFor(name)
    if (key) await AsyncStorage.setItem(key, JSON.stringify({ data, at: Date.now() }))
  } catch {
    /* a cache, nothing more */
  }
}

export async function readCache<T>(name: string): Promise<Cached<T> | null> {
  try {
    const key = await keyFor(name)
    const raw = key ? await AsyncStorage.getItem(key) : null
    return raw ? (JSON.parse(raw) as Cached<T>) : null
  } catch {
    return null
  }
}

/** On sign-out: forget everything that was saved for anyone on this phone. */
export async function clearCache() {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX))
    if (keys.length) await AsyncStorage.multiRemove(keys)
  } catch {
    /* nothing to clear */
  }
}

/** "5 min ago", "at 14:05", "Mon 14:05": when the shown data was saved. */
export function savedWhen(at: number) {
  const mins = Math.round((Date.now() - at) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const d = new Date(at)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return new Date().toDateString() === d.toDateString() ? `at ${time}` : `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`
}
