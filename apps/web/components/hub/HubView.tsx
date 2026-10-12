'use client'

import { AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Flame, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getTrackerData } from '@/app/actions/dashboard'
import { Avatar } from '@/components/Avatar'
import { FirstWeekChecklist } from '@/components/hub/FirstWeekChecklist'
import { ForYouToday } from '@/components/hub/ForYouToday'
import { GardenCard } from '@/components/hub/GardenCard'
import { WeeklyRecap } from '@/components/hub/WeeklyRecap'
import { HubCard } from '@/components/hub/HubCard'
import { WellnessTeam } from '@/components/hub/WellnessTeam'
import { InterventionBanner } from '@/components/interventions/InterventionBanner'
import { getDrinkLogs } from '@rajs8952/storage/supabase'
import { errorMessage } from '@rajs8952/core/errors'
import { exerciseRange } from '@rajs8952/core/exercise'
import { hubSummaries, type HubSummary, type TrackerData } from '@rajs8952/trackers/hub'
import { addDays, dayKey, greeting, startOfDay, startOfWeek } from '@rajs8952/core/dates'
import { effectiveGoal } from '@rajs8952/core/hydration'
import { SEVERITY_ORDER, latestInterventions, patternInterventions } from '@rajs8952/interventions'
import { meditationRange } from '@rajs8952/core/meditation'
import { MOODS, moodRange, type MoodLog, type MoodState } from '@rajs8952/core/mood'
import { MoodFace } from '@rajs8952/tracker-mood'
import { useTrackerStorage } from '@rajs8952/ui'
import { activeStreak, dayStreak, loadActivity, waterStreak, weekStreak, type Activity } from '@/lib/activity'
import { computeRecap, loadRecent, type RecentEntries } from '@/lib/recap'
import { sleepRange } from '@rajs8952/core/sleep'
import { createClient } from '@/lib/supabase/client'
import { TRACKERS, type TrackerId } from '@/lib/trackers'
import { useDismissed } from '@/lib/useDismissed'
import { useProfile } from '@/lib/useProfile'
import { weightRange } from '@rajs8952/core/weight'
import { goalsOf } from '@rajs8952/core/goals'
import { trackProgress } from '@/lib/progress'

/** The Home Hub: one at-a-glance card per tracker, each linking to its page. */
export function HubView() {
  const supabase = useMemo(() => createClient(), [])
  const { profile, error: profileError } = useProfile()
  const router = useRouter()

  // A brand-new account goes to the welcome screen once (focus and reminders).
  // onboarded_at is undefined before supabase/onboarding.sql exists, so nobody is redirected then.
  useEffect(() => {
    if (!profile || profile.onboarded_at !== null || !profile.created_at) return
    if (Date.now() - Date.parse(profile.created_at) < 3 * 86_400_000) router.replace('/welcome')
  }, [profile, router])
  const [trackerData, setTrackerData] = useState<TrackerData | null>(null)
  const [waterMl, setWaterMl] = useState<number | null>(null)
  const [activity, setActivity] = useState<Activity | null>(null)
  const [recent, setRecent] = useState<RecentEntries | null>(null)
  const storage = useTrackerStorage()
  /** Quick logging from the cards: which button is saving, and a short confirmation. */
  const [quickBusy, setQuickBusy] = useState<string | null>(null)
  const [quickNote, setQuickNote] = useState<{ tracker: TrackerId; text: string; error?: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    const now = new Date()
    // One server action for the five server-loaded trackers (Next.js runs actions one at a time).
    trackProgress(getTrackerData({
      mood: moodRange(now),
      meditation: meditationRange(now),
      sleep: sleepRange(now),
      weight: weightRange(now),
      exercise: exerciseRange(now),
    }))
      .then((d) => alive && setTrackerData(d))
      .catch((e) => {
        if (!alive) return
        const failed = { ok: false as const, error: errorMessage(e) }
        setTrackerData({ mood: failed, meditation: failed, sleep: failed, weight: failed, exercise: failed })
      })
    // Water reads straight from the browser, as the water tracker does.
    const today = startOfDay(now)
    trackProgress(getDrinkLogs(supabase, today, addDays(today, 1)))
      .then((logs) => alive && setWaterMl(logs.reduce((s, l) => s + l.effective_ml, 0)))
      .catch(() => alive && setWaterMl(-1))
    // Streak history (a few months of "which days"), loaded alongside.
    loadActivity(supabase, now)
      .then((a) => alive && setActivity(a))
      .catch(() => {})
    // The last two weeks' entries, for the weekly recap and the pattern nudges.
    loadRecent(supabase, now)
      .then((r) => alive && setRecent(r))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [supabase])

  useEffect(() => {
    if (!quickNote) return
    const t = setTimeout(() => setQuickNote(null), 3500)
    return () => clearTimeout(t)
  }, [quickNote])

  const todayKey = dayKey(new Date())

  /** One tap from Home: a glass or bottle of water now. */
  async function quickWater(ml: number) {
    setQuickBusy(`water-${ml}`)
    try {
      const log = await storage.water.add('water', ml)
      setWaterMl((v) => (v ?? 0) + log.effective_ml)
      setActivity((a) => (a ? { ...a, waterTotals: { ...a.waterTotals, [todayKey]: (a.waterTotals[todayKey] ?? 0) + log.effective_ml } } : a))
      setQuickNote({ tracker: 'water', text: `Added ${ml} ml` })
    } catch (e) {
      setQuickNote({ tracker: 'water', text: `Not saved: ${errorMessage(e)}`, error: true })
    } finally {
      setQuickBusy(null)
    }
  }

  /** One tap from Home: a mood check-in now. "Awful" brings up the support prompt, as on the Mood page. */
  async function quickMood(mood: MoodState) {
    setQuickBusy(`mood-${mood}`)
    const res = await storage.mood.create({ mood_state: mood })
    setQuickBusy(null)
    if (!res.ok) return setQuickNote({ tracker: 'mood', text: `Not saved: ${res.error}`, error: true })
    setTrackerData((d) => (d && d.mood.ok ? { ...d, mood: { ok: true, data: [res.data as MoodLog, ...d.mood.data] } } : d))
    setActivity((a) => (a ? { ...a, days: { ...a.days, mood: new Set([...a.days.mood, todayKey]) } } : a))
    setQuickNote({ tracker: 'mood', text: `Checked in: ${MOODS.find((m) => m.id === mood)?.label}` })
  }

  const now = new Date()
  const summaries: Partial<Record<TrackerId, HubSummary>> = useMemo(() => {
    if (!trackerData || waterMl === null || !profile) return {}
    const water = waterMl < 0 ? null : { todayMl: waterMl, goalMl: effectiveGoal(profile) }
    return hubSummaries(trackerData, water, new Date(), goalsOf(profile))
  }, [trackerData, waterMl, profile])

  // Alerts from the latest mood, sleep and weight; each can be dismissed (or, if critical, acknowledged) once.
  const { isDismissed, dismiss, ready } = useDismissed()
  const interventions = useMemo(() => {
    if (!trackerData || !profile) return []
    const data = <T,>(r: { ok: true; data: T[] } | { ok: false }) => (r.ok ? r.data : undefined)
    const latest = latestInterventions({ mood: data(trackerData.mood), sleep: data(trackerData.sleep), weight: data(trackerData.weight) }, profile)
    if (!activity || !recent) return latest
    // Patterns over the last week: low-mood or high-stress runs, lapses, comebacks, milestones.
    const goal = effectiveGoal(profile)
    const activeDays = new Set<string>([...Object.values(activity.days).flatMap((set) => [...set]), ...Object.keys(activity.waterTotals).filter((k) => activity.waterTotals[k]! > 0)])
    const last7 = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), -i)))
    const weekStart = startOfWeek(new Date()).getTime()
    const exerciseWeekMin = trackerData.exercise.ok ? trackerData.exercise.data.filter((l) => new Date(l.logged_at).getTime() >= weekStart).reduce((s, l) => s + l.duration_min, 0) : null
    const patterns = patternInterventions({
      moods: recent.mood,
      activeDays,
      waterDaysLast7: last7.filter((k) => (activity.waterTotals[k] ?? 0) > 0).length,
      water: waterMl === null || waterMl < 0 ? null : { todayMl: waterMl, goalMl: goal },
      exerciseWeekMin,
      waterGoalStreak: waterStreak(activity.waterTotals, goal),
      accountAgeDays: profile.created_at ? (Date.now() - Date.parse(profile.created_at)) / 86_400_000 : 30,
    })
    return [...latest, ...patterns].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity))
  }, [trackerData, profile, activity, recent, waterMl])
  const visible = ready ? interventions.filter((i) => !isDismissed(i.key)) : []
  const crisis = visible.find((i) => i.severity === 'CRITICAL') ?? null
  // At most two banners at once, most important first, so Home doesn't turn into a wall of advice.
  const banners = visible.filter((i) => i.severity !== 'CRITICAL').slice(0, 2)

  const recap = useMemo(
    () => (recent && activity && profile ? computeRecap(recent, activity.waterTotals, effectiveGoal(profile), goalsOf(profile)) : null),
    [recent, activity, profile],
  )

  const loaded = Object.keys(summaries).length > 0
  // Focus trackers (chosen on the welcome screen) come first.
  const focus = profile?.focus_trackers ?? []
  const ordered = [...TRACKERS].sort((a, b) => Number(focus.includes(b.id)) - Number(focus.includes(a.id)))
  const has = (r: { ok: boolean; data?: unknown[] } | undefined) => !!r?.ok && !!r.data?.length
  const loggedAnything = !!trackerData && (Object.values(trackerData).some((r) => has(r as never)) || (waterMl ?? 0) > 0)

  // Streaks: logged days in a row (weight: weeks; water: goal days, as on the Water page).
  const streaks: Partial<Record<TrackerId, { n: number; unit: 'day' | 'week' }>> = useMemo(() => {
    if (!activity || !profile) return {}
    const goal = effectiveGoal(profile)
    return {
      water: { n: waterStreak(activity.waterTotals, goal), unit: 'day' },
      mood: { n: dayStreak(activity.days.mood), unit: 'day' },
      sleep: { n: dayStreak(activity.days.sleep), unit: 'day' },
      meditation: { n: dayStreak(activity.days.meditation), unit: 'day' },
      exercise: { n: dayStreak(activity.days.exercise), unit: 'day' },
      weight: { n: weekStreak(activity.days.weight), unit: 'week' },
    }
  }, [activity, profile])
  const active = activity ? activeStreak(activity) : 0

  /** Quick-log buttons for the cards that have them. */
  function quickActions(id: TrackerId) {
    const note = quickNote?.tracker === id ? quickNote : null
    const status = (
      <span role="status" className={`text-xs font-semibold ${note?.error ? 'text-alert' : 'text-emerald-700'}`}>
        {note && !note.error && <Check className="mr-0.5 inline h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
        {note?.text}
      </span>
    )
    if (id === 'water') {
      return (
        <div className="flex flex-wrap items-center gap-2">
          {[250, 500].map((ml) => (
            <button
              key={ml}
              type="button"
              onClick={() => quickWater(ml)}
              disabled={!!quickBusy}
              className="inline-flex min-h-9 items-center gap-1 rounded-full bg-[#E3F0FB] px-3 text-sm font-bold text-[#1A5C99] transition hover:bg-[#D3E7F8] disabled:opacity-50"
              aria-label={`Add ${ml} ml of water`}
            >
              {quickBusy === `water-${ml}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : '+'} {ml} ml
            </button>
          ))}
          {status}
        </div>
      )
    }
    if (id === 'mood') {
      return (
        <div className="flex flex-wrap items-center gap-1">
          {MOODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => quickMood(m.id)}
              disabled={!!quickBusy}
              className="rounded-full p-1 transition hover:scale-110 hover:bg-mist disabled:opacity-50"
              aria-label={`Check in: ${m.label}`}
              title={m.label}
            >
              {quickBusy === `mood-${m.id}` ? <Loader2 className="h-7 w-7 animate-spin p-1 text-muted" aria-hidden /> : <MoodFace mood={m.id} className="h-7 w-7" />}
            </button>
          ))}
          <span className="ml-1">{status}</span>
        </div>
      )
    }
    return undefined
  }

  // The strip counts what's been tracked today; goals show on each card's ring.
  const loggedCount = TRACKERS.filter((t) => summaries[t.id]?.logged).length
  const firstName = profile?.full_name.split(' ')[0]

  return (
    <>
      <header className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
        <div>
          <p className="text-sm font-semibold text-muted">
            {now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          {active >= 2 && (
            <p className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-[#B9650E]">
              <Flame className="h-4 w-4" aria-hidden /> Active {active} days in a row
            </p>
          )}
        </div>
        {profile && (
          <Link href="/profile" aria-label="Edit profile" className="rounded-full">
            <Avatar src={profile.avatar_url} name={profile.full_name} size={48} />
          </Link>
        )}
      </header>

      {profileError && <p role="alert" className="notice-error mb-6">{profileError}</p>}

      <InterventionBanner intervention={crisis} onDismiss={() => crisis && dismiss(crisis.key)} />
      <div className={banners.length ? 'mb-6 space-y-3' : undefined}>
        <AnimatePresence initial={false}>
          {banners.map((i) => (
            <InterventionBanner key={i.key} intervention={i} onDismiss={() => dismiss(i.key)} />
          ))}
        </AnimatePresence>
      </div>

      {recap && <WeeklyRecap recap={recap} />}

      {profile && trackerData && (
        <FirstWeekChecklist
          createdAt={profile.created_at}
          focusChosen={!!profile.onboarded_at && focus.length > 0}
          loggedAnything={loggedAnything}
          checkedInMood={has(trackerData.mood as never)}
        />
      )}

      <section aria-labelledby="today-title" className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:mb-6">
        <h2 id="today-title" className="text-lg font-bold">
          Today
        </h2>
        <p className="flex items-center gap-2 text-sm font-semibold text-muted" aria-live="polite">
          {loaded ? (
            <>
              <span className="flex gap-1" aria-hidden>
                {TRACKERS.map((t) => (
                  <span
                    key={t.id}
                    className="h-2 w-5 rounded-full"
                    style={{ background: summaries[t.id]?.logged ? t.accent : '#D3E2E0' }}
                  />
                ))}
              </span>
              {loggedCount} of {TRACKERS.length} logged
            </>
          ) : (
            'Loading…'
          )}
        </p>
      </section>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        {ordered.map((t) => (
          <li key={t.id}>
            <HubCard tracker={t} summary={summaries[t.id] ?? null} focus={focus.includes(t.id)} streak={streaks[t.id]} actions={quickActions(t.id)} />
          </li>
        ))}
      </ul>

      {activity && profile && (
        <div className="mt-4">
          <GardenCard totals={activity.waterTotals} goal={effectiveGoal(profile)} />
        </div>
      )}

      {profile && <ForYouToday focus={focus} />}

      <section id="wellness-team" aria-labelledby="wellness-team-title" className="mt-10 scroll-mt-6">
        <div className="mb-4">
          <h2 id="wellness-team-title" className="text-lg font-bold">
            Your wellness team
          </h2>
          <p className="text-sm text-muted">Your company’s therapist, dietitian and employee assistance programme, here when you need them.</p>
        </div>
        <WellnessTeam />
      </section>
    </>
  )
}
