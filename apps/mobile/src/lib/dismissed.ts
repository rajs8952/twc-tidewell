import * as SecureStore from 'expo-secure-store'

/* ------------------------------------------------------------------
 * Prompts the person has acknowledged on this phone (e.g. today's crisis
 * prompt, a monthly BMI suggestion), so the same one doesn't keep coming
 * back. Keys come from @rajs8952/interventions. Only the newest 50 are kept.
 * ------------------------------------------------------------------ */

const KEY = 'omniwell.dismissed'
let cache: string[] | null = null

async function load() {
  if (cache) return cache
  try {
    cache = JSON.parse((await SecureStore.getItemAsync(KEY)) ?? '[]') as string[]
  } catch {
    cache = []
  }
  return cache
}

export async function isDismissed(key: string) {
  return (await load()).includes(key)
}

export async function dismiss(key: string) {
  const list = (await load()).filter((k) => k !== key)
  cache = [...list, key].slice(-50)
  SecureStore.setItemAsync(KEY, JSON.stringify(cache)).catch(() => {})
}

/** Everything acknowledged on this phone. */
export async function dismissedKeys(): Promise<string[]> {
  return [...(await load())]
}
