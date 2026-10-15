import { addDays, greeting, startOfDay } from '@rajs8952/core/dates'
import { goalsOf } from '@rajs8952/core/goals'
import { effectiveGoal } from '@rajs8952/core/hydration'
import { exerciseRange } from '@rajs8952/core/exercise'
import { meditationRange } from '@rajs8952/core/meditation'
import { MOODS, moodRange, type MoodState } from '@rajs8952/core/mood'
import { sleepRange } from '@rajs8952/core/sleep'
import { weightRange } from '@rajs8952/core/weight'
import { evaluateMetric, latestInterventions, moodInterventionKey, type Intervention, type KeyedIntervention } from '@rajs8952/interventions'
import { hubSummaries, type HubSummary, type TrackerData } from '@rajs8952/trackers/hub'
import { router, type Href } from 'expo-router'
import { BookOpen, Check, ChevronRight, Sparkles, Target } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { MoodFace, OfflineNotice, Ring, Status } from '@/components/kit'
import { CrisisPrompt, SupportBanner } from '@/components/Support'
import { ProfileButton } from '@/components/ProfileButton'
import { LogoMark, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { dismiss, dismissedKeys } from '@/lib/dismissed'
import { loadProfile } from '@/lib/profile'
import { COLORS, RADIUS } from '@/lib/theme'
import { BMI, TRACKERS, TRACKER_ORDER, messageOf, storage, type TrackerId, type TrackerMeta } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

/* ------------------------------------------------------------------
 * Home: one card per tracker with today's progress toward the person's
 * goals (the website's summaries, @rajs8952/trackers/hub), quick water
 * and mood logging, and the way into each tracker.
 * ------------------------------------------------------------------ */

async function loadHome() {
  const now = new Date()
  const today = startOfDay(now)
  const [profile, drinks, mood, meditation, sleep, weight, exercise] = await Promise.all([
    loadProfile(true),
    storage.water.list(today, addDays(today, 1)).then((l) => l.reduce((s, d) => s + d.effective_ml, 0), () => null),
    storage.mood.list(moodRange(now)),
    storage.meditation.list(meditationRange(now)),
    storage.sleep.list(sleepRange(now)),
    storage.weight.list(weightRange(now)),
    storage.exercise.list(exerciseRange(now)),
  ])
  const data: TrackerData = { mood, meditation, sleep, weight, exercise }
  const goal = effectiveGoal(profile)
  // The support prompts (the website's rules): today's mood, last night's sleep, the latest weigh-in.
  const prompts = latestInterventions({ mood: mood.ok ? mood.data : [], sleep: sleep.ok ? sleep.data : [], weight: weight.ok ? weight.data : [] }, profile, now)
  const dismissed = await dismissedKeys()
  return {
    profile,
    waterMl: drinks,
    summaries: hubSummaries(data, drinks === null ? null : { todayMl: drinks, goalMl: goal }, now, goalsOf(profile)),
    prompts: prompts.filter((p) => !dismissed.includes(p.key)),
    // A brand-new account goes to the welcome screen once, as on the website (onboarded_at is absent before onboarding.sql).
    needsWelcome: profile.onboarded_at === null && !!profile.created_at && now.getTime() - Date.parse(profile.created_at) < 3 * 86_400_000,
  }
}

export default function Home() {
  const { data, set, error, savedAt, refreshing, refresh } = useLoad(loadHome, 'home')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ tracker: TrackerId; text: string; error?: boolean } | null>(null)
  /** A prompt being shown: the crisis prompt (CRITICAL) or a banner. */
  const [crisis, setCrisis] = useState<Intervention | null>(null)
  const [hidden, setHidden] = useState<string[]>([])
  const prompts = (data?.prompts ?? []).filter((p) => !hidden.includes(p.key))
  const critical = prompts.find((p) => p.severity === 'CRITICAL')
  const banner = prompts.find((p) => p.severity === 'WARNING' || p.severity === 'SUGGESTION')

  // Today's "Awful" check-in (from here, the Mood screen or the website) opens the crisis prompt until acknowledged.
  const shownCrisis = crisis ?? critical ?? null

  function acknowledge(p: KeyedIntervention | Intervention) {
    const key = 'key' in p ? p.key : moodInterventionKey(p)
    void dismiss(key)
    setHidden((h) => [...h, key])
  }

  const first = data?.profile.full_name.trim().split(/\s+/)[0]
  // Only from freshly loaded data: the copy saved on the phone may be from before the welcome was finished.
  const needsWelcome = !!data?.needsWelcome && savedAt === null
  useEffect(() => {
    if (needsWelcome) router.replace('/welcome')
  }, [needsWelcome])
  // The trackers they chose to focus on come first.
  const focus = data?.profile.focus_trackers ?? []
  const order = [...TRACKER_ORDER].sort((a, b) => Number(focus.includes(b)) - Number(focus.includes(a)))
  const summaries = data?.summaries
  const loggedCount = summaries ? TRACKER_ORDER.filter((id) => summaries[id].logged).length : 0
  const metCount = summaries ? TRACKER_ORDER.filter((id) => summaries[id].done).length : 0

  async function quick(tracker: TrackerId, key: string, save: () => Promise<string>) {
    setBusy(key)
    setNote(null)
    try {
      setNote({ tracker, text: await save() })
      const fresh = await loadHome()
      set(fresh)
    } catch (e) {
      setNote({ tracker, text: messageOf(e), error: true })
    } finally {
      setBusy(null)
    }
  }

  const quickWater = (ml: number) =>
    quick('water', `water-${ml}`, async () => {
      await storage.water.add('water', ml)
      return `Added ${ml} ml`
    })
  const quickMood = (mood: MoodState) =>
    quick('mood', `mood-${mood}`, async () => {
      const r = await storage.mood.create({ mood_state: mood })
      if (!r.ok) throw new Error(r.error)
      const check = evaluateMetric({ type: 'mood', value: mood })
      if (check.severity === 'CRITICAL') setCrisis(check)
      return 'Checked in'
    })


  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* A soft wash behind the header, in OmniWell's blues. */}
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="homeWash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#DDF1FB" />
              <Stop offset="0.6" stopColor="#E9F5F1" />
              <Stop offset="1" stopColor={COLORS.background} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#homeWash)" />
        </Svg>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <View style={styles.topBar}>
          <View style={styles.brand} accessibilityRole="header" accessibilityLabel="OmniWell">
            <LogoMark size={30} />
            <Text style={styles.brandText}>OmniWell</Text>
          </View>
          <ProfileButton profile={data?.profile} />
        </View>

        <Text style={styles.date}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting()}
          {first ? `, ${first}` : ''}
        </Text>

        <OfflineNotice savedAt={savedAt} />
        {error && !data && <Notice tone="error">{error}</Notice>}
        {!data && !error && <Loader label="Getting your day ready…" />}

        <CrisisPrompt
          intervention={shownCrisis}
          onAcknowledge={() => {
            if (shownCrisis) acknowledge(shownCrisis)
            setCrisis(null)
          }}
        />

        {summaries && (
          <>
            {/* Today at a glance: how many trackers have an entry, and how many goals are met. */}
            <View style={styles.hero}>
              <Ring progress={loggedCount / TRACKER_ORDER.length} color={COLORS.tide500} size={96} stroke={9}>
                <Text style={styles.heroCount}>
                  {loggedCount}
                  <Text style={styles.heroOf}>/{TRACKER_ORDER.length}</Text>
                </Text>
              </Ring>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.heroTitle}>{loggedCount === 0 ? 'Start your day' : loggedCount === TRACKER_ORDER.length ? 'Everything tracked' : 'Your day so far'}</Text>
                <Text style={styles.heroText}>
                  {loggedCount} of {TRACKER_ORDER.length} tracked today
                  {metCount > 0 ? ` · ${metCount} ${metCount === 1 ? 'goal' : 'goals'} met` : ''}
                </Text>
                <View style={styles.heroIcons}>
                  {TRACKER_ORDER.map((id) => {
                    const t = TRACKERS[id]
                    const Icon = t.icon
                    const on = summaries[id].logged
                    return (
                      <Pressable key={id} onPress={() => router.push(`/${id}` as Href)} hitSlop={4} style={[styles.heroIcon, { backgroundColor: on ? t.accent : COLORS.mist }]} accessibilityRole="button" accessibilityLabel={`${t.name}${on ? ', tracked today' : ', not tracked yet'}`}>
                        <Icon size={14} color={on ? COLORS.white : COLORS.muted} />
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </View>

            {banner && <SupportBanner intervention={banner} onDismiss={() => acknowledge(banner)} />}

            {/* One-tap logging, without opening a tracker. */}
            <View style={styles.quick}>
              <View style={styles.quickHead}>
                <Sparkles size={16} color={COLORS.tide600} />
                <Text style={styles.quickTitle}>Quick log</Text>
              </View>
              <Text style={styles.quickLabel}>Water</Text>
              <View style={styles.quickRow}>
                {[250, 500].map((ml) => (
                  <Pressable
                    key={ml}
                    onPress={() => void quickWater(ml)}
                    disabled={!!busy}
                    style={({ pressed }) => [styles.quickWater, (pressed || busy === `water-${ml}`) && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${ml} ml of water`}
                  >
                    {busy === `water-${ml}` ? <ActivityIndicator size="small" color="#1A5C99" /> : <Text style={styles.quickWaterText}>+ {ml} ml</Text>}
                  </Pressable>
                ))}
              </View>
              {note?.tracker === 'water' && <Status note={note} />}
              <Text style={styles.quickLabel}>How are you feeling?</Text>
              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => void quickMood(m.id)}
                    disabled={!!busy}
                    hitSlop={4}
                    style={({ pressed }) => [styles.moodButton, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Check in: ${m.label}`}
                  >
                    {busy === `mood-${m.id}` ? <ActivityIndicator style={{ width: 36, height: 36 }} color={COLORS.muted} /> : <MoodFace mood={m.id} size={36} />}
                    <Text style={styles.moodLabel}>{m.label}</Text>
                  </Pressable>
                ))}
              </View>
              {note?.tracker === 'mood' && <Status note={note} />}
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.section} accessibilityRole="header">
                Your trackers
              </Text>
              {focus.length > 0 && <Text style={styles.sectionHint}>Your focus first</Text>}
            </View>
            <View style={styles.grid}>
              {order.map((id) => (
                <TrackerTile key={id} meta={TRACKERS[id]} summary={summaries[id]} focus={focus.includes(id)} onOpen={() => router.push(`/${id}` as Href)} />
              ))}
            </View>

            <Text style={styles.section} accessibilityRole="header">
              More for you
            </Text>
            <View style={styles.grid}>
              <ToolTile meta={BMI} title="BMI calculator" onOpen={() => router.push('/bmi')} />
              <ToolTile meta={PROGRAMMES_META} title="Programmes" onOpen={() => router.push('/programmes')} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

/** One tracker: its colour, today's value and progress toward the person's goal. */
function TrackerTile({ meta, summary, focus, onOpen }: { meta: TrackerMeta; summary: HubSummary; focus: boolean; onOpen: () => void }) {
  const Icon = meta.icon
  const progress = Math.min(Math.max(summary.progress ?? 0, 0), 1)
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${meta.name}: ${summary.value}, ${summary.caption}${summary.done ? ', goal met' : ''}. Open ${meta.name}.`}
    >
      <View style={styles.tileTop}>
        <View style={[styles.tileIcon, { backgroundColor: meta.tint }]}>
          <Icon size={20} color={meta.accent} />
        </View>
        {summary.done ? (
          <View style={[styles.tag, { backgroundColor: meta.accent }]}>
            <Check size={11} color={COLORS.white} strokeWidth={3} />
            <Text style={[styles.tagText, { color: COLORS.white }]}>Goal</Text>
          </View>
        ) : focus ? (
          <View style={[styles.tag, { backgroundColor: meta.tint }]}>
            <Target size={11} color={meta.accent} />
            <Text style={[styles.tagText, { color: meta.accent }]}>Focus</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileName, { color: meta.accent }]}>{meta.name}</Text>
      <Text style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {summary.value}
      </Text>
      <Text style={styles.tileCaption} numberOfLines={2}>
        {summary.caption}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: meta.accent }]} />
      </View>
    </Pressable>
  )
}

/** Home's way into programmes, in the website's programmes colour. */
const PROGRAMMES_META: TrackerMeta = { id: 'bmi', name: 'Programmes', description: 'One small step a day, for a week or less.', icon: BookOpen, accent: '#B9650E', tint: '#FFF1D9' }

function ToolTile({ meta, title, onOpen }: { meta: TrackerMeta; title: string; onOpen: () => void }) {
  const Icon = meta.icon
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.tile, styles.toolTile, { backgroundColor: meta.tint, borderColor: meta.tint }, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.tileIcon, { backgroundColor: COLORS.white }]}>
        <Icon size={20} color={meta.accent} />
      </View>
      <Text style={[styles.toolTitle, { color: meta.accent }]}>{title}</Text>
      <Text style={styles.tileCaption} numberOfLines={2}>
        {meta.description}
      </Text>
      <ChevronRight size={18} color={meta.accent} style={styles.toolChevron} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 340 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { fontSize: 20, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.3 },
  date: { marginTop: 6, fontSize: 14, fontWeight: '700', color: COLORS.muted },
  greeting: { marginTop: -10, fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 18, backgroundColor: COLORS.white, borderRadius: RADIUS.card, padding: 18, shadowColor: '#0F2F37', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  heroCount: { fontSize: 28, fontWeight: '800', color: COLORS.ink },
  heroOf: { fontSize: 16, fontWeight: '700', color: COLORS.muted },
  heroTitle: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  heroText: { fontSize: 14, color: COLORS.muted },
  heroIcons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  heroIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quick: { backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 10 },
  quickHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quickTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  quickLabel: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickWater: { flex: 1, minHeight: 44, borderRadius: RADIUS.pill, backgroundColor: '#E3F0FB', alignItems: 'center', justifyContent: 'center' },
  quickWaterText: { fontSize: 15, fontWeight: '800', color: '#1A5C99' },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between' },
  moodButton: { alignItems: 'center', gap: 4, minWidth: 52 },
  moodLabel: { fontSize: 11, fontWeight: '600', color: COLORS.muted },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 },
  section: { marginTop: 4, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  sectionHint: { fontSize: 13, fontWeight: '600', color: COLORS.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 },
  tile: { width: '48.4%', backgroundColor: COLORS.white, borderRadius: 22, borderWidth: 1, borderColor: COLORS.line, padding: 14, gap: 2 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tileIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: RADIUS.pill, paddingHorizontal: 7, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '800' },
  tileName: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  tileValue: { fontSize: 20, fontWeight: '800', color: COLORS.ink },
  tileCaption: { fontSize: 12, lineHeight: 16, color: COLORS.muted, minHeight: 32 },
  bar: { marginTop: 8, height: 6, borderRadius: 3, backgroundColor: COLORS.mist, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  toolTile: { paddingBottom: 16 },
  toolTitle: { marginTop: 2, fontSize: 15, fontWeight: '800' },
  toolChevron: { position: 'absolute', top: 16, right: 14 },
  pressed: { opacity: 0.75 },
})
