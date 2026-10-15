import { parseDayKey } from '@rajs8952/core/dates'
import { goalsOf } from '@rajs8952/core/goals'
import { effectiveGoal } from '@rajs8952/core/hydration'
import { CALM_LABELS } from '@rajs8952/core/meditation'
import { MOOD_BY_ID } from '@rajs8952/core/mood'
import { analyzeRollup, shiftDate, type Insights } from '@omniwell/web/insights/analyze'
import { buildHeadline } from '@omniwell/web/insights/headline'
import { STATS_DAYS, computeStats, fmtMin, loadStats, moodWord, type StatsResult, type Together } from '@omniwell/web/insights/stats'
import { router, type Href } from 'expo-router'
import { CalendarDays, ChevronRight, Link2, Plus, Sparkles, TrendingUp } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'
import { OfflineNotice } from '@/components/kit'
import { ProfileButton } from '@/components/ProfileButton'
import { PremiumCard } from '@/components/Support'
import { Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile } from '@/lib/profile'
import { usePlan } from '@/lib/plan'
import { supabase } from '@/lib/supabase'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS, TRACKER_ORDER, type TrackerId } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

/* ------------------------------------------------------------------
 * Insights, as on the website (components/insights/InsightsView.tsx),
 * with the website's own calculations (apps/web/lib/insights):
 *   your last 30 days     plain numbers per tracker
 *   the headline          the strongest link between water, sleep and mood
 *   habits together       exercise and meditation days against mood and sleep
 * Premium. Everything is read as the signed-in person (row-level security).
 * ------------------------------------------------------------------ */

const ACCENT = '#6A55C9'
const TITLE = { 'water-next-sleep': 'Water and sleep', 'sleep-mood': 'Sleep and mood', 'water-mood': 'Water and mood' } as const

async function load() {
  const profile = await loadProfile()
  const goalMl = effectiveGoal(profile)
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const to = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date())
  const from = shiftDate(to, -(STATS_DAYS - 1))
  const [entries, rollup] = await Promise.all([
    loadStats(supabase),
    supabase.from('daily_wellness_rollup').select('date, total_water_ml, total_sleep_minutes, average_mood_score').gte('date', from).lte('date', to).order('date', { ascending: true }),
  ])
  let insights: Pick<Insights, 'insights' | 'headline'> | null = null
  if (!rollup.error) {
    const analysis = analyzeRollup(rollup.data ?? [], from, STATS_DAYS)
    insights = { insights: analysis.insights, headline: buildHeadline(analysis.insights, analysis.days, goalMl, STATS_DAYS) }
  }
  return { profile, stats: computeStats(entries, goalMl, goalsOf(profile)), insights }
}

const day = (k: string) => parseDayKey(k).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
const ml = (n: number) => `${n.toLocaleString()} ml`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The website's card for each tracker: a big number, a caption and a few facts (YourStats.tsx). */
function linesFor(id: TrackerId, s: StatsResult['trackers']): { big: string; caption: string; facts: { label: string; value: string }[] } | null {
  switch (id) {
    case 'water': {
      const w = s.water
      if (!w) return null
      return { big: ml(w.avgMl), caption: `a day, on ${plural(w.days, 'day')} logged`, facts: [{ label: 'Goal met', value: plural(w.goalDays, 'day') }, { label: 'Best day', value: `${ml(w.best.value)}, ${day(w.best.date)}` }] }
    }
    case 'sleep': {
      const z = s.sleep
      if (!z) return null
      return {
        big: z.avgMin != null ? fmtMin(z.avgMin) : fmtMin(z.longest.value),
        caption: z.avgMin != null ? `a night, over ${plural(z.nights, 'night')}` : 'your first night logged',
        facts: [
          ...(z.avgQuality != null ? [{ label: 'Quality', value: `${z.avgQuality.toFixed(1)} of 5` }] : []),
          { label: 'Goal met', value: plural(z.goalNights, 'night') },
          ...(z.nights >= 2 ? [{ label: 'Longest', value: `${fmtMin(z.longest.value)}, ${day(z.longest.date)}` }] : []),
        ],
      }
    }
    case 'mood': {
      const m = s.mood
      if (!m) return null
      return {
        big: m.avgScore != null ? `Mostly ${moodWord(m.avgScore).toLowerCase()}` : MOOD_BY_ID[m.common].label,
        caption: `over ${plural(m.checkIns, 'check-in')} on ${plural(m.days, 'day')}`,
        facts: [
          ...(m.topEmotions.length ? [{ label: 'Felt most', value: m.topEmotions.join(', ') }] : []),
          ...(m.avgStress != null ? [{ label: 'Stress', value: `${m.avgStress.toFixed(1)} of 5 on average` }] : []),
          ...(m.bestWeekday ? [{ label: 'Best day', value: `You tend to feel best on ${m.bestWeekday}` }] : []),
        ],
      }
    }
    case 'exercise': {
      const x = s.exercise
      if (!x) return null
      return {
        big: fmtMin(x.totalMin),
        caption: `in ${plural(x.sessions, 'session')}`,
        facts: [
          { label: 'A week', value: `${fmtMin(x.avgWeekMin)} on average` },
          { label: 'Most often', value: x.favourite },
          ...(x.sessions >= 2 ? [{ label: 'Longest day', value: `${fmtMin(x.longest.value)}, ${day(x.longest.date)}` }] : []),
        ],
      }
    }
    case 'meditation': {
      const d = s.meditation
      if (!d) return null
      const calm = d.calm
      return {
        big: fmtMin(d.totalMin),
        caption: `in ${plural(d.sessions, 'session')}, ${fmtMin(d.avgMin)} each`,
        facts: [
          ...(calm
            ? [
                {
                  label: 'Calm',
                  value:
                    calm.after > calm.before
                      ? `${CALM_LABELS[Math.round(calm.before) - 1]} → ${CALM_LABELS[Math.round(calm.after) - 1]!.toLowerCase()}, up ${(calm.after - calm.before).toFixed(1)}`
                      : `${CALM_LABELS[Math.round(calm.after) - 1]} after, on average`,
                },
              ]
            : []),
          { label: 'Most often', value: d.favourite },
        ],
      }
    }
    case 'weight': {
      const w = s.weight
      if (!w) return null
      return {
        big: `${w.latest.toFixed(1)} kg`,
        caption: w.change == null ? 'your first weigh-in' : `latest of ${plural(w.entries, 'weigh-in')}`,
        facts:
          w.change == null
            ? []
            : [
                { label: 'Change', value: w.change === 0 ? 'No change' : `${w.change > 0 ? '+' : '−'}${Math.abs(w.change).toFixed(1)} kg since ${w.first.toFixed(1)} kg` },
                { label: 'Range', value: `${w.low.toFixed(1)}–${w.high.toFixed(1)} kg` },
              ],
      }
    }
  }
}

export default function InsightsScreen() {
  const plan = usePlan()
  const locked = !!plan && !plan.premium
  const { data, error, savedAt, refreshing, refresh } = useLoad(load, 'insights')

  const cards = data ? TRACKER_ORDER.map((id) => ({ id, l: linesFor(id, data.stats.trackers) })) : []
  const logged = cards.filter((c) => c.l)
  const empty = cards.filter((c) => !c.l)
  const headline = data?.insights?.headline
  const [headlineSize, setHeadlineSize] = useState({ w: 0, h: 0 })

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* A soft wash behind the header, in the Insights violet. */}
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="insightsWash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#ECE8FA" />
              <Stop offset="0.6" stopColor="#E6F1FA" />
              <Stop offset="1" stopColor={COLORS.background} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#insightsWash)" />
        </Svg>
      </View>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={locked ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <View style={styles.topBar}>
          <View style={styles.badge}>
            <CalendarDays size={13} color={ACCENT} />
            <Text style={styles.badgeText}>Last {STATS_DAYS} days</Text>
          </View>
          <ProfileButton profile={data?.profile} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          Insights
        </Text>
        <Text style={styles.lead}>How your habits are going, and how they connect, in plain words.</Text>

        {locked ? (
          <PremiumCard title="Insights" text={`Your last ${STATS_DAYS} days for every tracker, and how your habits connect, are part of Premium.`} />
        ) : (
          <>
            <OfflineNotice savedAt={savedAt} />
            {error && <Notice tone="error">{error}</Notice>}
            {!data && !error && <Loader label="Looking at your last 30 days…" />}

            {data && (
              <View style={styles.active}>
                <View style={{ flex: 1, gap: 6 }}>
                  <Text style={styles.activeText}>
                    <Text style={styles.activeCount}>{data.stats.activeDays}</Text> of {data.stats.span} days with an entry
                  </Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.round((data.stats.activeDays / Math.max(1, data.stats.span)) * 100)}%` }]} />
                  </View>
                </View>
                <Text style={styles.activeTrackers}>
                  {logged.length}/{TRACKER_ORDER.length}
                  {'\n'}
                  <Text style={styles.activeTrackersLabel}>trackers</Text>
                </Text>
              </View>
            )}

            {headline && (
              <View style={styles.headline} onLayout={(e) => setHeadlineSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
                {/* Sized from the card's own measured size: a percentage-sized gradient didn't stretch to fill it. */}
                <Svg width={headlineSize.w} height={headlineSize.h} style={StyleSheet.absoluteFill}>
                  <Defs>
                    <LinearGradient id="headlineFill" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor="#6A55C9" />
                      <Stop offset="1" stopColor="#2189D6" />
                    </LinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width={headlineSize.w} height={headlineSize.h} fill="url(#headlineFill)" />
                </Svg>
                <View style={styles.headlineTag}>
                  <Sparkles size={14} color={COLORS.white} />
                  <Text style={styles.headlineTagText}>{headline.kind === 'finding' ? 'Your strongest link' : headline.kind === 'collecting' ? 'Still learning' : 'No clear pattern yet'}</Text>
                </View>
                <Text style={styles.headlineText}>{headline.text}</Text>
                <Text style={styles.headlineDetail}>{headline.detail}</Text>
                {headline.comparison && (
                  <View style={styles.pair}>
                    {headline.comparison.groups.map((g, i) => (
                      <View key={g.label} style={[styles.headlineBox, i === headline.comparison!.better && styles.headlineBoxBest]}>
                        <Text style={styles.headlineBoxLabel}>{g.label}</Text>
                        <Text style={styles.headlineBoxValue}>{g.display}</Text>
                        <Text style={styles.headlineBoxSmall}>
                          {headline.comparison!.outcomeLabel} · {plural(g.days, 'day')}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {data && (
              <>
                <Text style={styles.section} accessibilityRole="header">
                  Tracker by tracker
                </Text>
                {logged.length === 0 && <Text style={styles.muted}>Nothing logged yet. Your numbers appear here from your first entry.</Text>}
                {logged.map(({ id, l }) => {
                  const t = TRACKERS[id]
                  const Icon = t.icon
                  return (
                    <Pressable key={id} onPress={() => router.push(`/${id}` as Href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} accessibilityRole="button">
                      <View style={[styles.cardAccent, { backgroundColor: t.accent }]} />
                      <View style={styles.cardBody}>
                        <View style={styles.cardHead}>
                          <View style={[styles.cardIcon, { backgroundColor: t.tint }]}>
                            <Icon size={18} color={t.accent} />
                          </View>
                          <Text style={[styles.cardName, { color: t.accent }]}>{t.name}</Text>
                          <ChevronRight size={18} color={COLORS.muted} style={{ marginLeft: 'auto' }} />
                        </View>
                        <Text style={styles.big}>{l!.big}</Text>
                        <Text style={styles.small}>{l!.caption}</Text>
                        {l!.facts.length > 0 && (
                          <View style={styles.facts}>
                            {l!.facts.map((f) => (
                              <View key={f.label} style={[styles.fact, { backgroundColor: t.tint }]}>
                                <Text style={styles.factLabel}>{f.label}</Text>
                                <Text style={styles.factValue}>{f.value}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </Pressable>
                  )
                })}
                {empty.length > 0 && (
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyTitle}>Not tracked in the last {data.stats.span} days</Text>
                    <View style={styles.chips}>
                      {empty.map(({ id }) => {
                        const t = TRACKERS[id]
                        const Icon = t.icon
                        return (
                          <Pressable key={id} onPress={() => router.push(`/${id}` as Href)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={`Start tracking ${t.name}`}>
                            <Icon size={14} color={t.accent} />
                            <Text style={styles.chipText}>{t.name}</Text>
                            <Plus size={14} color={COLORS.muted} />
                          </Pressable>
                        )
                      })}
                    </View>
                  </View>
                )}

                <View style={styles.sectionRow}>
                  <Link2 size={18} color={ACCENT} />
                  <Text style={styles.sectionInline} accessibilityRole="header">
                    Habits that go together
                  </Text>
                </View>
                {data.stats.together.length ? (
                  data.stats.together.map((t) => <TogetherCard key={t.id} t={t} />)
                ) : (
                  <Text style={styles.muted}>Log exercise or meditation alongside your mood and sleep on a few days, and we’ll show you how they go together. You need at least two days with the habit and two without.</Text>
                )}

                {data.insights && (
                  <>
                    <View style={styles.sectionRow}>
                      <TrendingUp size={18} color={ACCENT} />
                      <Text style={styles.sectionInline} accessibilityRole="header">
                        Water, sleep and mood over time
                      </Text>
                    </View>
                    {data.insights.insights.map((i) => (
                      <View key={i.id} style={styles.overTime}>
                        <Text style={styles.overTimeName}>{TITLE[i.id]}</Text>
                        <Text style={styles.connHead}>{i.headline}</Text>
                        <Text style={styles.muted}>{i.message}</Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function TogetherCard({ t }: { t: Together }) {
  return (
    <View style={styles.together}>
      <Text style={styles.togetherSentence}>{t.sentence}</Text>
      <View style={styles.pair}>
        {[
          { label: t.withLabel, value: t.withValue, detail: t.withDetail, n: t.nWith },
          { label: t.withoutLabel, value: t.withoutValue, detail: t.withoutDetail, n: t.nWithout },
        ].map((g) => (
          <View key={g.label} style={styles.pairBox}>
            <Text style={styles.pairLabel}>{g.label}</Text>
            <Text style={styles.pairValue}>{g.value}</Text>
            <Text style={styles.pairSmall}>{[g.detail, plural(g.n, 'day')].filter(Boolean).join(' · ')}</Text>
          </View>
        ))}
      </View>
      {t.early && <Text style={styles.small}>An early sign from a few days. Keep logging to see if it holds.</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800', color: ACCENT },
  title: { fontSize: 32, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6, marginTop: -4 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginTop: -6 },
  active: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: COLORS.white, borderRadius: RADIUS.card, padding: 16, shadowColor: '#0F2F37', shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  activeText: { fontSize: 14, color: COLORS.muted },
  activeCount: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  activeTrackers: { textAlign: 'center', fontSize: 20, fontWeight: '800', color: ACCENT },
  activeTrackersLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#ECE8FA', overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: ACCENT },
  headline: { borderRadius: RADIUS.card, overflow: 'hidden', padding: 20, gap: 8, backgroundColor: '#4F6FCF' },
  headlineTag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 4 },
  headlineTagText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: COLORS.white },
  headlineText: { fontSize: 21, fontWeight: '800', lineHeight: 27, color: COLORS.white },
  headlineDetail: { fontSize: 14, lineHeight: 20, color: 'rgba(255,255,255,0.88)' },
  headlineBox: { flex: 1, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', padding: 12, gap: 2, borderWidth: 1.5, borderColor: 'transparent' },
  headlineBoxBest: { backgroundColor: 'rgba(255,255,255,0.24)', borderColor: 'rgba(255,255,255,0.7)' },
  headlineBoxLabel: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  headlineBoxValue: { fontSize: 17, fontWeight: '800', color: COLORS.white },
  headlineBoxSmall: { fontSize: 11, color: 'rgba(255,255,255,0.8)' },
  section: { marginTop: 6, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  sectionRow: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionInline: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  muted: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  small: { fontSize: 13, color: COLORS.muted },
  card: { flexDirection: 'row', borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, overflow: 'hidden' },
  cardAccent: { width: 5 },
  cardBody: { flex: 1, padding: 16, gap: 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  big: { fontSize: 26, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.4 },
  facts: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 1, maxWidth: '100%' },
  factLabel: { fontSize: 11, fontWeight: '700', color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  factValue: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  emptyBox: { borderRadius: RADIUS.card, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, padding: 14, gap: 10 },
  emptyTitle: { fontSize: 13, fontWeight: '700', color: COLORS.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, borderRadius: RADIUS.pill, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, paddingHorizontal: 12 },
  chipText: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  together: { borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 4 },
  togetherSentence: { fontSize: 16, lineHeight: 22, fontWeight: '800', color: COLORS.ink },
  overTime: { borderRadius: RADIUS.card, backgroundColor: '#F4F2FC', borderWidth: 1, borderColor: '#E3DEF7', padding: 16, gap: 4 },
  overTimeName: { fontSize: 15, fontWeight: '800', color: ACCENT },
  connHead: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: COLORS.muted },
  pair: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pairBox: { flex: 1, borderRadius: 16, backgroundColor: COLORS.mist, padding: 12, gap: 2 },
  pairLabel: { fontSize: 12, color: COLORS.muted },
  pairValue: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  pairSmall: { fontSize: 11, color: COLORS.muted },
})
