import { describe, expect, it, vi } from 'vitest'
import { createRestStorage } from '../rest'

function api(handler: (method: string, url: string, body: unknown, headers: Headers) => { status?: number; json?: unknown }) {
  const calls: string[] = []
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push(`${init.method} ${url}`)
    const { status = 200, json } = handler(init.method!, url, init.body ? JSON.parse(init.body as string) : undefined, new Headers(init.headers))
    return new Response(json === undefined ? null : JSON.stringify(json), { status })
  })
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls }
}

describe('createRestStorage', () => {
  it('maps log stores onto the documented routes with the host’s headers', async () => {
    const seen: string[] = []
    const { fetch, calls } = api((method, _url, body, headers) => {
      seen.push(headers.get('Authorization') ?? '')
      if (method === 'GET') return { json: [] }
      if (method === 'POST') return { status: 201, json: { id: '1', ...(body as object) } }
      return { status: 204 }
    })
    const s = createRestStorage({ baseUrl: 'https://api.test/wellness/', headers: async () => ({ Authorization: 'Bearer t' }), fetch })
    expect(await s.mood.list({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-08T00:00:00.000Z' })).toEqual({ ok: true, data: [] })
    expect(await s.mood.create({ mood_state: 'good' })).toEqual({ ok: true, data: { id: '1', mood_state: 'good' } })
    expect(await s.mood.remove('a/b')).toEqual({ ok: true, data: null })
    expect(calls).toEqual([
      'GET https://api.test/wellness/mood?from=2026-10-05T00%3A00%3A00.000Z&to=2026-10-08T00%3A00%3A00.000Z',
      'POST https://api.test/wellness/mood',
      'DELETE https://api.test/wellness/mood/a%2Fb',
    ])
    expect(seen).toEqual(['Bearer t', 'Bearer t', 'Bearer t'])
  })

  it('turns failures into results for logs, using the server’s message', async () => {
    const { fetch } = api(() => ({ status: 422, json: { error: 'Pick how you feel first.' } }))
    const s = createRestStorage({ baseUrl: 'https://api.test', fetch })
    expect(await s.mood.create({ mood_state: 'good' })).toEqual({ ok: false, error: 'Pick how you feel first.' })
    const down = createRestStorage({ baseUrl: 'https://api.test', fetch: (async () => { throw new TypeError('Failed to fetch') }) as never })
    expect(await down.sleep.list({ from: 'a', to: 'b' })).toEqual({ ok: false, error: 'Failed to fetch' })
  })

  it('throws for water and profile, which expect it', async () => {
    const { fetch, calls } = api((method, url) => (url.includes('daily-totals') ? { json: { '2026-10-07': 900 } } : { status: 500 }))
    const s = createRestStorage({ baseUrl: 'https://api.test', fetch })
    expect(await s.water.dailyTotals(30)).toEqual({ '2026-10-07': 900 })
    expect(calls[0]).toMatch(/^GET https:\/\/api\.test\/water\/daily-totals\?days=30&tz=/)
    await expect(s.profile.get()).rejects.toThrow('Request failed (500).')
  })
})
