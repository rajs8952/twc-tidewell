/* ------------------------------------------------------------------
 * TrackerStorage over a plain JSON HTTP API. The server implements:
 *
 *   GET    {base}/{tracker}?from=ISO&to=ISO   → TLog[]   (newest first)
 *   POST   {base}/{tracker}                   → TLog     (weight: { log, profileSynced })
 *   DELETE {base}/{tracker}/{id}
 *   GET    {base}/water?from=ISO&to=ISO        → DrinkLog[]
 *   POST   {base}/water   { beverage, amount_ml } → DrinkLog
 *   DELETE {base}/water/{id}
 *   GET    {base}/water/daily-totals?days=N&tz=Area/City → { 'YYYY-MM-DD': ml }
 *   GET    {base}/profile                      → Profile
 *   PATCH  {base}/profile                      → Profile
 *
 * where {tracker} is mood, sleep, weight, exercise or meditation.
 * Errors are any non-2xx status; a JSON body { "error": "…" } supplies
 * the message shown to the user.
 * ------------------------------------------------------------------ */

import type { TrackerStorage } from '@rajs8952/core/storage'
import type { ActionResult } from '@rajs8952/core/types'

export interface RestStorageOptions {
  /** API root, e.g. 'https://api.example.com/wellness'. */
  baseUrl: string
  /** Extra headers for every request, e.g. an Authorization bearer token. */
  headers?: () => HeadersInit | Promise<HeadersInit>
  /** Defaults to the global fetch. */
  fetch?: typeof fetch
}

export function createRestStorage(options: RestStorageOptions): TrackerStorage {
  const base = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args))

  /** Resolves to the parsed body; throws Error with the server's message on failure. */
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers = new Headers(await options.headers?.())
    if (body !== undefined) headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')
    const res = await doFetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text()
    const parsed = text ? JSON.parse(text) : null
    if (!res.ok) {
      const message = parsed && typeof parsed.error === 'string' ? parsed.error : `Request failed (${res.status}).`
      throw new Error(message)
    }
    return parsed as T
  }

  /** The same, as an ActionResult: log stores never throw. */
  async function result<T>(method: string, path: string, body?: unknown): Promise<ActionResult<T>> {
    try {
      return { ok: true, data: await request<T>(method, path, body) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong. Try again.' }
    }
  }

  const range = (from: string, to: string) => `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

  function logStore<TLog, TInput, TSaved = TLog>(name: string) {
    return {
      list: (r: { from: string; to: string }) => result<TLog[]>('GET', `/${name}${range(r.from, r.to)}`),
      create: (input: TInput) => result<TSaved>('POST', `/${name}`, input),
      remove: async (id: string): Promise<ActionResult<null>> => {
        const r = await result<unknown>('DELETE', `/${name}/${encodeURIComponent(id)}`)
        return r.ok ? { ok: true, data: null } : r
      },
    }
  }

  return {
    mood: logStore('mood'),
    sleep: logStore('sleep'),
    weight: logStore('weight'),
    exercise: logStore('exercise'),
    meditation: logStore('meditation'),
    water: {
      list: (from, to) => request('GET', `/water${range(from.toISOString(), to.toISOString())}`),
      add: (beverage, amountMl) => request('POST', '/water', { beverage, amount_ml: Math.round(amountMl) }),
      remove: async (id) => {
        await request('DELETE', `/water/${encodeURIComponent(id)}`)
      },
      dailyTotals: (days = 400) => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
        return request('GET', `/water/daily-totals?days=${days}&tz=${encodeURIComponent(tz)}`)
      },
    },
    profile: {
      get: () => request('GET', '/profile'),
      update: (_id, patch) => request('PATCH', '/profile', patch),
    },
  }
}
