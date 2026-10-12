'use client'

import { AlertTriangle, Download, Inbox, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { errorMessage } from '@rajs8952/core/errors'
import { TEAMS, type Team } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------
 * Admin portal → Coaches: each coach's workload and response times
 * (admin_coach_stats() in supabase/coach-operations.sql). Counts and
 * times only: no employee names and no message content.
 * ------------------------------------------------------------------ */

interface Row {
  coach_id: string | null
  team: Team
  display_name: string
  title: string
  is_accepting_new: boolean | null
  max_capacity: number | null
  current_load: number | null
  last_seen_at: string | null
  open_now: number
  waiting_now: number
  overdue_now: number
  oldest_wait_hours: number | null
  replies_sent: number | null
  answered: number | null
  median_reply_hours: number | null
  within_24h: number | null
  closed: number | null
}

const PERIODS = [7, 30, 90] as const
const ONLINE_MS = 2 * 60_000

const hours = (h: number | null) => (h == null ? '–' : h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Number(h).toFixed(h < 10 ? 1 : 0)} h` : `${Math.round(h / 24)} days`)
const pct = (v: number | null) => (v == null ? '–' : `${Math.round(Number(v) * 100)}%`)

function seen(iso: string | null) {
  if (!iso) return 'Never in the portal'
  const ms = Date.now() - Date.parse(iso)
  if (ms < ONLINE_MS) return 'Online now'
  const m = Math.round(ms / 60_000)
  if (m < 60) return `Seen ${m} min ago`
  const h = Math.round(m / 60)
  if (h < 48) return `Seen ${h} h ago`
  return `Seen ${new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`
}

function Load({ load, max }: { load: number; max: number }) {
  const full = load >= max
  return (
    <span className="block min-w-[88px]">
      <span className={`text-sm font-bold tabular-nums ${full ? 'text-[#C42B1C]' : ''}`}>
        {load} / {max}
      </span>
      <span className="mt-1 block h-1.5 rounded-full bg-mist" aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, max ? (load / max) * 100 : 100)}%`, background: full ? '#C42B1C' : '#1A6DB5' }} />
      </span>
    </span>
  )
}

function toCsv(rows: Row[], days: number) {
  const head = ['coach', 'team', 'accepting_new', 'load', 'capacity', 'open_now', 'waiting_now', 'overdue_now', 'oldest_wait_hours', `replies_sent_${days}d`, `answered_${days}d`, 'median_reply_hours', 'within_24h', `closed_${days}d`, 'last_seen']
  const v = (x: unknown) => (x == null ? '' : `"${String(x).replace(/"/g, '""')}"`)
  return [head.join(','), ...rows.map((r) => [r.display_name, r.team, r.is_accepting_new, r.current_load, r.max_capacity, r.open_now, r.waiting_now, r.overdue_now, r.oldest_wait_hours, r.replies_sent, r.answered, r.median_reply_hours, r.within_24h, r.closed, r.last_seen_at].map(v).join(','))].join('\n')
}

export function CoachOps() {
  const supabase = useMemo(() => createClient(), [])
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    trackProgress(Promise.resolve(supabase.rpc('admin_coach_stats', { p_days: days })))
      .then(({ data, error: e }) => {
        if (!alive) return
        if (e) setError(e.code === 'PGRST202' ? 'Coach operations aren’t set up yet. Run supabase/coach-operations.sql in Supabase first.' : e.code === '42501' ? 'Only admins can see coach operations.' : e.message)
        else {
          setError(null)
          setRows((data ?? []) as Row[])
        }
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [supabase, days])

  // Most urgent first: overdue, then waiting, then name.
  const coaches = (rows ?? []).filter((r) => r.coach_id).sort((a, b) => b.overdue_now - a.overdue_now || b.waiting_now - a.waiting_now || a.display_name.localeCompare(b.display_name))
  const pools = (rows ?? []).filter((r) => !r.coach_id)

  function download() {
    if (!rows) return
    const url = URL.createObjectURL(new Blob([toCsv(coaches, days)], { type: 'text/csv;charset=utf-8' }))
    Object.assign(document.createElement('a'), { href: url, download: `omniwell-coaches-${new Date().toISOString().slice(0, 10)}.csv` }).click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Coaches</h1>
          <p className="mt-1 max-w-2xl text-muted">Workload and response times for each coach. Counts and times only: no employee names and no message content.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="ops-period">
            Period
          </label>
          <select id="ops-period" value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof PERIODS)[number])} className="input w-auto py-2.5">
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                Last {p} days
              </option>
            ))}
          </select>
          <button type="button" onClick={download} disabled={!rows} className="btn-secondary">
            <Download className="h-4 w-4" aria-hidden /> CSV
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="notice-error mb-6">
          {error}
        </p>
      )}
      {loading && !rows && !error && (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      )}

      {rows && (
        <div className={`space-y-6 transition ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {pools.map((p) => (
              <div key={p.team} className={`flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ${p.overdue_now ? 'ring-[#E8B4A9]' : 'ring-line'}`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: TEAMS[p.team].accent }}>
                  <Inbox className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{TEAMS[p.team].label} pool</p>
                  <p className="text-sm text-muted">
                    {p.open_now === 0 ? 'Nothing waiting to be claimed.' : `${p.open_now} unclaimed${p.oldest_wait_hours != null ? ` · oldest waiting ${hours(p.oldest_wait_hours)}` : ''}`}
                  </p>
                </div>
                {p.overdue_now > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#FDECEA] px-2.5 py-1 text-xs font-bold text-[#8C1D13]">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {p.overdue_now} overdue
                  </span>
                )}
              </div>
            ))}
          </div>

          {coaches.length === 0 ? (
            <p className="rounded-3xl bg-white p-6 text-center text-muted ring-1 ring-line">No coaches yet. Give someone the Coach role in Users.</p>
          ) : (
            <section aria-label="Coaches" className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
              {/* Desktop: a table. */}
              <table className="hidden w-full text-left text-sm lg:table">
                <thead className="bg-mist text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3 font-bold">Coach</th>
                    <th className="px-3 py-3 font-bold">Load</th>
                    <th className="px-3 py-3 font-bold">Waiting for a reply</th>
                    <th className="px-3 py-3 font-bold">Typical reply</th>
                    <th className="px-3 py-3 font-bold">Within 24 h</th>
                    <th className="px-3 py-3 font-bold">Replies sent</th>
                    <th className="px-3 py-3 font-bold">Closed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {coaches.map((c) => (
                    <tr key={c.coach_id} className={c.overdue_now ? 'bg-[#FFF8F6]' : undefined}>
                      <td className="px-4 py-3">
                        <p className="font-bold">{c.display_name}</p>
                        <p className="text-xs text-muted">
                          <span className="font-bold" style={{ color: TEAMS[c.team].accent }}>
                            {TEAMS[c.team].label}
                          </span>
                          {' · '}
                          <span className={seen(c.last_seen_at) === 'Online now' ? 'font-semibold text-emerald-700' : ''}>{seen(c.last_seen_at)}</span>
                          {c.is_accepting_new === false && <span className="font-semibold text-[#8C1D13]"> · Not accepting new</span>}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <Load load={c.current_load ?? 0} max={c.max_capacity ?? 0} />
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-bold tabular-nums">{c.waiting_now}</span>
                        {c.overdue_now > 0 && <span className="ml-1.5 rounded-full bg-[#FDECEA] px-2 py-0.5 text-xs font-bold text-[#8C1D13]">{c.overdue_now} overdue</span>}
                        {c.oldest_wait_hours != null && <span className="block text-xs text-muted">oldest {hours(c.oldest_wait_hours)}</span>}
                      </td>
                      <td className="px-3 py-3 font-bold tabular-nums">{hours(c.median_reply_hours)}</td>
                      <td className={`px-3 py-3 font-bold tabular-nums ${c.within_24h != null && c.within_24h < 0.8 ? 'text-[#C42B1C]' : ''}`}>{pct(c.within_24h)}</td>
                      <td className="px-3 py-3 tabular-nums">{c.replies_sent ?? 0}</td>
                      <td className="px-3 py-3 tabular-nums">{c.closed ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Phones and tablets: a card per coach. */}
              <ul className="divide-y divide-line lg:hidden">
                {coaches.map((c) => (
                  <li key={c.coach_id} className={`p-4 ${c.overdue_now ? 'bg-[#FFF8F6]' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold">{c.display_name}</p>
                        <p className="text-xs text-muted">
                          <span className="font-bold" style={{ color: TEAMS[c.team].accent }}>
                            {TEAMS[c.team].label}
                          </span>{' '}
                          · {seen(c.last_seen_at)}
                          {c.is_accepting_new === false && <span className="font-semibold text-[#8C1D13]"> · Not accepting new</span>}
                        </p>
                      </div>
                      <Load load={c.current_load ?? 0} max={c.max_capacity ?? 0} />
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-muted">Waiting</dt>
                        <dd className="font-bold tabular-nums">
                          {c.waiting_now}
                          {c.overdue_now > 0 && <span className="ml-1 text-xs text-[#8C1D13]">({c.overdue_now} overdue)</span>}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Typical reply</dt>
                        <dd className="font-bold tabular-nums">{hours(c.median_reply_hours)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Within 24 h</dt>
                        <dd className="font-bold tabular-nums">{pct(c.within_24h)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Replies sent</dt>
                        <dd className="tabular-nums">{c.replies_sent ?? 0}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">Closed</dt>
                        <dd className="tabular-nums">{c.closed ?? 0}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs text-muted">
            <b>Waiting for a reply</b>: open conversations where the employee wrote last; <b>overdue</b> after 24 hours. <b>Typical reply</b> is the median time from an
            employee’s message to the next coach reply, over the last {days} days; <b>within 24 h</b> counts late and still-unanswered messages against it. Load and capacity
            can be changed in Users.
          </p>
        </div>
      )}
    </>
  )
}
