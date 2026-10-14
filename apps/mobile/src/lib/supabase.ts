import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { AppState } from 'react-native'

/* ------------------------------------------------------------------
 * The app's Supabase client: the same project, row-level security and
 * accounts as the website (EXPO_PUBLIC_* in .env.local; both values are
 * public, as they are on the website).
 *
 * The sign-in session is kept in the phone's secure storage (Keychain on
 * iOS, Keystore on Android), never in plain storage. iOS can refuse large
 * values, so it's saved in small chunks.
 * ------------------------------------------------------------------ */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY (apps/mobile/.env.local).')

const CHUNK = 1800
/** SecureStore keys may only use letters, digits, '.', '-' and '_'. */
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_')

const secureStorage = {
  async getItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${safe(key)}.n`))
    if (!count) return null
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${safe(key)}.${i}`)))
    return parts.some((p) => p === null) ? null : parts.join('')
  },
  async setItem(key: string, value: string) {
    await secureStorage.removeItem(key)
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? ['']
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${safe(key)}.${i}`, p)))
    await SecureStore.setItemAsync(`${safe(key)}.n`, String(parts.length))
  },
  async removeItem(key: string) {
    const count = Number(await SecureStore.getItemAsync(`${safe(key)}.n`))
    await SecureStore.deleteItemAsync(`${safe(key)}.n`)
    await Promise.all(Array.from({ length: count || 0 }, (_, i) => SecureStore.deleteItemAsync(`${safe(key)}.${i}`)))
  },
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Keep the session fresh only while the app is in use (no timers in the background).
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh()
  else supabase.auth.stopAutoRefresh()
})
