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
import { BookOpen, Check, ChevronRight } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Card, MoodFace, Ring, Status } from '@/components/kit'
import { CrisisPrompt, SupportBanner } from '@/components/Support'
import { Logo, Notice } from '@/components/ui'
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
  }
}

export default function Home() {
  const { data, set, error, refreshing, refresh } = useLoad(loadHome)
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
  const summaries = data?.summaries
  const loggedCount = summaries ? TRACKER_ORDER.filter((id) => summaries[id].logged).length : 0

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
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <Logo />
        <View style={{ marginTop: 20 }}>
          <Text style={styles.date}>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          <Text style={styles.greeting} accessibilityRole="header">
            {greeting()}
            {first ? `, ${first}` : ''}
          </Text>
        </View>

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
            {banner && (
              <View style={{ marginTop: 16 }}>
                <SupportBanner intervention={banner} onDismiss={() => acknowledge(banner)} />
              </View>
            )}
            <View style={styles.strip}>
              <Text style={styles.stripText}>
                <Text style={styles.stripCount}>{loggedCount} of 6</Text> tracked today
              </Text>
              <View style={styles.dots}>
                {TRACKER_ORDER.map((id) => (
                  <View key={id} style={[styles.dot, { backgroundColor: summaries[id].logged ? TRACKERS[id].accent : COLORS.line }]} />
                ))}
              </View>
            </View>

            <View style={styles.cards}>
              {TRACKER_ORDER.map((id) => (
                <TrackerCard key={id} meta={TRACKERS[id]} summary={summaries[id]} onOpen={() => router.push(`/${id}` as Href)}>
                  {id === 'water' && (
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
                      {note?.tracker === 'water' && <Status note={note} />}
                    </View>
                  )}
                  {id === 'mood' && (
                    <View style={styles.quickRow}>
                      {MOODS.map((m) => (
                        <Pressable
                          key={m.id}
                          onPress={() => void quickMood(m.id)}
                          disabled={!!busy}
                          hitSlop={4}
                          style={({ pressed }) => [pressed && styles.pressed]}
                          accessibilityRole="button"
                          accessibilityLabel={`Check in: ${m.label}`}
                        >
                          {busy === `mood-${m.id}` ? <ActivityIndicator style={{ width: 34, height: 34 }} color={COLORS.muted} /> : <MoodFace mood={m.id} size={34} />}
                        </Pressable>
                      ))}
                      {note?.tracker === 'mood' && <Status note={note} />}
                    </View>
                  )}
                </TrackerCard>
              ))}
              <ToolCard meta={BMI} title="BMI calculator" onOpen={() => router.push('/bmi')} />
              <ToolCard meta={PROGRAMMES_META} title="Programmes" onOpen={() => router.push('/programmes')} />
            </View>
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  )
}

function TrackerCard({ meta, summary, onOpen, children }: { meta: TrackerMeta; summary: HubSummary; onOpen: () => void; children?: React.ReactNode }) {
  const Icon = meta.icon
  return (
    <Card style={styles.trackerCard}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.cardTop, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`${meta.name}: ${summary.value}, ${summary.caption}${summary.done ? ', goal met' : ''}. Open ${meta.name}.`}>
        <Ring progress={summary.progress} color={meta.accent} size={56} stroke={6}>
          {summary.done ? <Check size={22} color={meta.accent} strokeWidth={3} /> : <Icon size={22} color={meta.accent} />}
        </Ring>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: meta.accent }]}>{meta.name}</Text>
          <Text style={styles.cardValue}>{summary.value}</Text>
          <Text style={styles.cardCaption}>{summary.caption}</Text>
        </View>
        <ChevronRight size={20} color={COLORS.muted} />
      </Pressable>
      {children}
    </Card>
  )
}

/** Home's way into programmes, in the website's programmes colour. */
const PROGRAMMES_META: TrackerMeta = { id: 'bmi', name: 'Programmes', description: 'One small step a day, for a week or less.', icon: BookOpen, accent: '#B9650E', tint: '#FFF1D9' }

function ToolCard({ meta, title, onOpen }: { meta: TrackerMeta; title: string; onOpen: () => void }) {
  const Icon = meta.icon
  return (
    <Card style={styles.trackerCard}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.cardTop, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={title}>
        <View style={[styles.toolIcon, { backgroundColor: meta.tint }]}>
          <Icon size={22} color={meta.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardName, { color: meta.accent }]}>{title}</Text>
          <Text style={styles.cardCaption}>{meta.description}</Text>
        </View>
        <ChevronRight size={20} color={COLORS.muted} />
      </Pressable>
    </Card>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 40 },
  date: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
  greeting: { marginTop: 2, fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  strip: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 16, paddingVertical: 10 },
  stripText: { fontSize: 14, color: COLORS.muted },
  stripCount: { fontWeight: '800', color: COLORS.ink },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cards: { marginTop: 16, gap: 12 },
  trackerCard: { padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardName: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  cardValue: { marginTop: 2, fontSize: 20, fontWeight: '800', color: COLORS.ink },
  cardCaption: { fontSize: 13, color: COLORS.muted },
  toolIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingLeft: 70 },
  quickWater: { minHeight: 36, minWidth: 84, paddingHorizontal: 12, borderRadius: RADIUS.pill, backgroundColor: '#E3F0FB', alignItems: 'center', justifyContent: 'center' },
  quickWaterText: { fontSize: 14, fontWeight: '800', color: '#1A5C99' },
  pressed: { opacity: 0.7 },
})
