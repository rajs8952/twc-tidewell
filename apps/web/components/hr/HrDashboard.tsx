'use client'

import { Activity, Download, EyeOff, Loader2, MessageCircleHeart, Smile, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { errorMessage } from '@rajs8952/core/errors'
import { TEAMS, type Team } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { TRACKERS } from '@/lib/trackers'

/* ------------------------------------------------------------------
 * Company insights (/hr): anonymised totals for HR and admins, from
 * hr_dashboard() in supabase/hr-dashboard.sql. The database returns
 * totals only, and null for any group of fewer than 5 people, which is
 * shown here as "fewer than 5". Nothing here identifies anyone.
 * ------------------------------------------------------------------ */

interface ChatStats {
  started: number | null
  median_hours: number | null
  within_24h: number | null
}
interface Week {
  week: string
  active: number | null
  mood: { people: number; avg_mood: number; avg_stress: number | null; low_share: number; checkins: number } | null
  chats: Partial<Record<Team, ChatStats>> | null
}
interface HrData {
  generated_at: string
  timezone: string
  min_group: number
  employees: number
  active_7d: number | null
  active_30d: number | null
  checkins_7d: number | null
  weeks: Week[]
  adoption: Record<string, number | null>
  support_30d: Partial<Record<Team, ChatStats>> | null
  overdue: Partial<Record<Team, number>>
}

const BLUE = '#1A6DB5'
const MOOD = '#C2185B'
const STRESS = '#B9650E'
const GRID = '#E3ECEB'
const RANGES = [8, 12, 26] as const

const weekLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const pct = (v: number | null | undefined) => (v == null ? null : `${Math.round(v * 100)}%`)
const hours = (h: number | null | undefined) => (h == null ? null : h < 1 ? `${Math.round(h * 60)} min` : `${Number(h).toFixed(h < 10 ? 1 : 0)} h`)

/** A value, or the "fewer than 5" marker when the database hid it. */
function Value({ v, small, k }: { v: ReactNode | null | undefined; small?: boolean; k: number }) {
  if (v != null) return <>{v}</>
  return (
    <span className={`inline-flex items-center gap-1 font-semibold text-muted ${small ? 'text-xs' : 'text-base'}`} title={`Hidden: fewer than ${k} people`}>
      <EyeOff className={small ? 'h-3 w-3' : 'h-4 w-4'} aria-hidden />
      fewer than {k}
    </span>
  )
}

function Card({ title, subtitle, icon: Icon, children, id }: { title: string; subtitle?: string; icon: typeof Users; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className="rounded-3xl bg-white p-5 ring-1 ring-line">
      <h2 id={id} className="flex items-center gap-2 text-lg font-bold">
        <Icon className="h-5 w-5 text-[#1F6E64]" aria-hidden />
        {title}
      </h2>
      {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Tile({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums leading-tight">{children}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  )
}

function ChartTooltip({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string; format: (n: string, v: number | null) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-line">
      <p className="font-bold">Week of {label ? weekLabel(label) : ''}</p>
      {payload.map((p) => (
        <p key={p.name} className="mt-0.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {format(p.name, p.value)}
        </p>
      ))}
    </div>
  )
}

function toCsv(d: HrData) {
  const k = d.min_group
  const cell = (v: number | null | undefined) => (v == null ? `<${k}` : String(v))
  const head = ['week_starting', 'active_employees', 'mood_people', 'avg_mood_1_5', 'avg_stress_1_5', 'low_mood_share', 'therapist_chats', 'therapist_median_reply_h', 'therapist_within_24h', 'dietitian_chats', 'dietitian_median_reply_h', 'dietitian_within_24h']
  const rows = d.weeks.map((w) => [
    w.week,
    cell(w.active),
    cell(w.mood?.people),
    cell(w.mood?.avg_mood),
    cell(w.mood?.avg_stress),
    cell(w.mood?.low_share),
    ...(['therapist', 'dietitian'] as Team[]).flatMap((t) => {
      const c = w.chats?.[t]
      return c ? [cell(c.started), cell(c.median_hours), cell(c.within_24h)] : ['0', '', '']
    }),
  ])
  return [`# OmniWell company insights, generated ${d.generated_at} (${d.timezone}). Groups of fewer than ${k} people are hidden as <${k}.`, head.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

export function HrDashboard() {
  const supabase = useMemo(() => createClient(), [])
  const [weeks, setWeeks] = useState<(typeof RANGES)[number]>(12)
  const [data, setData] = useState<HrData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
    trackProgress(Promise.resolve(supabase.rpc('hr_dashboard', { p_weeks: weeks, p_tz: tz })))
      .then(({ data: d, error: e }) => {
        if (!alive) return
        if (e) setError(e.code === 'PGRST202' ? 'The company dashboard isn’t set up yet. Run supabase/hr-dashboard.sql in Supabase first.' : e.code === '42501' ? 'Only HR and admins can see the company dashboard.' : e.message)
        else {
          setError(null)
          setData(d as HrData)
        }
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [supabase, weeks])

  function download() {
    if (!data) return
    const url = URL.createObjectURL(new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `omniwell-company-insights-${data.generated_at.slice(0, 10)}.csv` })
    a.click()
    URL.revokeObjectURL(url)
  }

  const k = data?.min_group ?? 5
  const thisWeek = data?.weeks[data.weeks.length - 1]
  const lastMood = data ? [...data.weeks].reverse().find((w) => w.mood) : undefined
  const chartWeeks = data?.weeks.map((w) => ({ week: w.week, active: w.active, mood: w.mood?.avg_mood ?? null, stress: w.mood?.avg_stress ?? null })) ?? []
  const hiddenWeeks = data?.weeks.filter((w) => w.active == null).length ?? 0
  const adoption = TRACKERS.map((t) => ({ t, n: data?.adoption?.[t.id] ?? null }))
  const maxAdoption = Math.max(1, ...adoption.map((a) => a.n ?? 0))

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Company insights</h1>
          <p className="mt-1 max-w-2xl text-muted">
            Anonymised totals for everyone using OmniWell. No names, entries or messages are ever shown, and any group of fewer than {k} people is hidden.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="hr-range">
            Period
          </label>
          <select id="hr-range" value={weeks} onChange={(e) => setWeeks(Number(e.target.value) as (typeof RANGES)[number])} className="input w-auto py-2.5">
            {RANGES.map((r) => (
              <option key={r} value={r}>
                Last {r} weeks
              </option>
            ))}
          </select>
          <button type="button" onClick={download} disabled={!data} className="btn-secondary">
            <Download className="h-4 w-4" aria-hidden /> CSV
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="notice-error mb-6">
          {error}
        </p>
      )}
      {loading && !data && !error && (
        <p className="flex items-center gap-2 text-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </p>
      )}

      {data && (
        <div className={`space-y-6 transition ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Employees on OmniWell" note="Active accounts, not coaches, admins or HR">
              {data.employees.toLocaleString()}
            </Tile>
            <Tile label="Active this week" note={data.active_7d != null && data.employees ? `${Math.round((data.active_7d / data.employees) * 100)}% of employees, last 7 days` : 'Logged or messaged, last 7 days'}>
              <Value v={data.active_7d?.toLocaleString()} k={k} />
            </Tile>
            <Tile label="Active this month" note={data.active_30d != null && data.employees ? `${Math.round((data.active_30d / data.employees) * 100)}% of employees, last 30 days` : 'Last 30 days'}>
              <Value v={data.active_30d?.toLocaleString()} k={k} />
            </Tile>
            <Tile label="Mood check-ins" note="Last 7 days">
              <Value v={data.checkins_7d?.toLocaleString()} k={k} />
            </Tile>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="hr-active" title="Weekly active employees" subtitle="Employees who logged anything or messaged the wellness team, by week." icon={Users}>
              <div className="h-56" role="img" aria-label={`Weekly active employees. This week: ${thisWeek?.active ?? `fewer than ${k}`}.`}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartWeeks} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="week" tickFormatter={weekLabel} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: '#557178' }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#557178' }} />
                    <Tooltip cursor={{ fill: '#EDF4F3' }} content={<ChartTooltip format={(_, v) => (v == null ? `Fewer than ${k} active` : `${v} active`)} />} />
                    <Bar dataKey="active" name="Active" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {hiddenWeeks > 0 && <p className="mt-2 text-xs text-muted">{hiddenWeeks === 1 ? 'One week had' : `${hiddenWeeks} weeks had`} fewer than {k} active employees, so no bar is shown.</p>}
            </Card>

            <Card id="hr-adoption" title="Tracker use" subtitle="Employees who used each tracker in the last 30 days." icon={Activity}>
              <ul className="space-y-3">
                {adoption.map(({ t, n }) => {
                  const Icon = t.icon
                  const share = n != null && data.active_30d ? n / data.active_30d : null
                  return (
                    <li key={t.id}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-1.5 font-semibold">
                          <Icon className="h-4 w-4" style={{ color: t.accent }} aria-hidden />
                          {t.name}
                        </span>
                        <span className="tabular-nums text-muted">
                          <Value v={n != null ? `${n.toLocaleString()}${share != null ? ` · ${pct(share)} of active` : ''}` : null} small k={k} />
                        </span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-mist" aria-hidden>
                        {n != null && n > 0 && <div className="h-full rounded-full" style={{ width: `${(n / maxAdoption) * 100}%`, background: t.accent }} />}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </div>

          <Card id="hr-mood" title="Mood and stress" subtitle={`Weekly averages from employees’ check-ins, on a 1–5 scale. Only weeks with at least ${k} people are shown.`} icon={Smile}>
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="h-60" role="img" aria-label={lastMood?.mood ? `Average mood ${lastMood.mood.avg_mood} of 5 in the week of ${weekLabel(lastMood.week)}.` : 'Not enough check-ins yet.'}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartWeeks} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="week" tickFormatter={weekLabel} tickLine={false} axisLine={{ stroke: GRID }} tick={{ fontSize: 11, fill: '#557178' }} interval="preserveStartEnd" minTickGap={16} />
                    <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#557178' }} />
                    <Tooltip content={<ChartTooltip format={(n, v) => (v == null ? `${n}: not enough check-ins` : `${n}: ${Number(v).toFixed(1)} of 5`)} />} />
                    <Line type="monotone" dataKey="mood" name="Mood" stroke={MOOD} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} connectNulls={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="stress" name="Stress" stroke={STRESS} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3 text-sm">
                <p className="flex items-center gap-2">
                  <span className="h-0.5 w-6 rounded" style={{ background: MOOD }} aria-hidden /> Mood (higher is better)
                </p>
                <p className="flex items-center gap-2">
                  <span className="h-0.5 w-6 rounded border-t-2 border-dashed" style={{ borderColor: STRESS }} aria-hidden /> Stress (higher is more stressed)
                </p>
                {lastMood?.mood ? (
                  <div className="rounded-2xl bg-mist p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted">Week of {weekLabel(lastMood.week)}</p>
                    <p className="mt-1">
                      Mood <b>{Number(lastMood.mood.avg_mood).toFixed(1)}</b> · Stress <b>{lastMood.mood.avg_stress != null ? Number(lastMood.mood.avg_stress).toFixed(1) : '–'}</b>
                    </p>
                    <p className="mt-0.5">
                      <b>{pct(lastMood.mood.low_share)}</b> of check-ins were Bad or Awful
                    </p>
                    <p className="mt-0.5 text-xs text-muted">From {lastMood.mood.people} people</p>
                  </div>
                ) : (
                  <p className="text-muted">Not enough check-ins yet to show a trend.</p>
                )}
              </div>
            </div>
          </Card>

          <Card id="hr-support" title="Wellness team support" subtitle="Conversations with the therapist and dietitian teams in the last 30 days. No content is ever shown." icon={MessageCircleHeart}>
            <div className="grid gap-3 md:grid-cols-2">
              {(['therapist', 'dietitian'] as Team[]).map((t) => {
                const s = data.support_30d?.[t]
                const overdue = data.overdue?.[t] ?? 0
                return (
                  <div key={t} className="rounded-2xl p-4 ring-1 ring-line">
                    <p className="font-bold" style={{ color: TEAMS[t].accent }}>
                      {TEAMS[t].label} team
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-muted">Conversations started</dt>
                        <dd className="font-display text-xl font-extrabold tabular-nums">{s ? <Value v={s.started} k={k} /> : 0}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Typical first reply</dt>
                        <dd className="font-display text-xl font-extrabold tabular-nums">{s ? <Value v={hours(s.median_hours)} k={k} /> : '–'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Answered within 24 h</dt>
                        <dd className="font-display text-xl font-extrabold tabular-nums">{s ? <Value v={pct(s.within_24h)} k={k} /> : '–'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Overdue right now</dt>
                        <dd className={`font-display text-xl font-extrabold tabular-nums ${overdue ? 'text-[#C42B1C]' : ''}`}>{overdue}</dd>
                      </div>
                    </dl>
                  </div>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-muted">
              “Typical first reply” is the median time from an employee’s first message to a coach’s first reply. “Overdue” counts open conversations waiting more than 24
              hours for a reply; it describes the team’s workload, not any employee.
            </p>
          </Card>

          <p className="text-xs text-muted">
            Updated {new Date(data.generated_at).toLocaleString()} · weeks start on Monday ({data.timezone}). Employees are counted when they log an entry in any tracker or
            message the wellness team.
          </p>
        </div>
      )}
    </>
  )
}
