import { parseDayKey } from '@rajs8952/core/dates'
import { goalsOf } from '@rajs8952/core/goals'
import { effectiveGoal } from '@rajs8952/core/hydration'
import { CALM_LABELS } from '@rajs8952/core/meditation'
import { MOOD_BY_ID } from '@rajs8952/core/mood'
import { analyzeRollup, shiftDate, type Insights } from '@omniwell/web/insights/analyze'
import { buildHeadline } from '@omniwell/web/insights/headline'
import { STATS_DAYS, computeStats, fmtMin, loadStats, moodWord, type StatsResult, type Together } from '@omniwell/web/insights/stats'
import { router, type Href } from 'expo-router'
import { ChevronRight, Link2, Sparkles } from 'lucide-react-native'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
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
  return { stats: computeStats(entries, goalMl, goalsOf(profile)), insights }
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
  const { data, error, refreshing, refresh } = useLoad(load)

  const cards = data ? TRACKER_ORDER.map((id) => ({ id, l: linesFor(id, data.stats.trackers) })) : []
  const logged = cards.filter((c) => c.l)
  const empty = cards.filter((c) => !c.l)
  const headline = data?.insights?.headline

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={locked ? undefined : <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} />}>
        <Text style={styles.title} accessibilityRole="header">
          Insights
        </Text>
        <Text style={styles.lead}>Your habits over the last {STATS_DAYS} days, and how they connect.</Text>

        {locked ? (
          <PremiumCard title="Insights" text={`Your last ${STATS_DAYS} days for every tracker, and how your habits connect, are part of Premium.`} />
        ) : (
          <>
            {error && <Notice tone="error">{error}</Notice>}
            {!data && !error && <Loader label="Looking at your last 30 days…" />}

            {headline && (
              <View style={styles.headline}>
                <View style={styles.headlineTag}>
                  <Sparkles size={16} color={ACCENT} />
                  <Text style={styles.headlineTagText}>{headline.kind === 'finding' ? 'Your strongest link' : headline.kind === 'collecting' ? 'Still learning' : 'No clear pattern yet'}</Text>
                </View>
                <Text style={styles.headlineText}>{headline.text}</Text>
                <Text style={styles.muted}>{headline.detail}</Text>
                {headline.comparison && (
                  <View style={styles.pair}>
                    {headline.comparison.groups.map((g, i) => (
                      <View key={g.label} style={[styles.pairBox, i === headline.comparison!.better && { borderColor: ACCENT, borderWidth: 1.5 }]}>
                        <Text style={styles.pairLabel}>{g.label}</Text>
                        <Text style={styles.pairValue}>{g.display}</Text>
                        <Text style={styles.pairSmall}>
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
                  Your last {data.stats.span} days
                </Text>
                <Text style={styles.muted}>{data.stats.activeDays ? `You logged something on ${plural(data.stats.activeDays, 'day')}.` : 'Nothing logged yet. Your numbers appear here from your first entry.'}</Text>
                {logged.map(({ id, l }) => {
                  const t = TRACKERS[id]
                  const Icon = t.icon
                  return (
                    <Pressable key={id} onPress={() => router.push(`/${id}` as Href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} accessibilityRole="button">
                      <View style={styles.cardHead}>
                        <Icon size={16} color={t.accent} />
                        <Text style={styles.cardName}>{t.name}</Text>
                        <ChevronRight size={16} color={COLORS.muted} style={{ marginLeft: 'auto' }} />
                      </View>
                      <Text style={styles.big}>{l!.big}</Text>
                      <Text style={styles.small}>{l!.caption}</Text>
                      {l!.facts.length > 0 && (
                        <View style={styles.facts}>
                          {l!.facts.map((f) => (
                            <View key={f.label} style={styles.fact}>
                              <Text style={styles.factLabel}>{f.label}</Text>
                              <Text style={styles.factValue}>{f.value}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </Pressable>
                  )
                })}
                {empty.map(({ id }) => {
                  const t = TRACKERS[id]
                  const Icon = t.icon
                  return (
                    <Pressable key={id} onPress={() => router.push(`/${id}` as Href)} style={styles.empty} accessibilityRole="button">
                      <Icon size={18} color={t.accent} />
                      <Text style={[styles.muted, { flex: 1 }]}>
                        <Text style={{ fontWeight: '800', color: COLORS.ink }}>{t.name}</Text>: nothing logged in the last {data.stats.span} days.
                      </Text>
                      <ChevronRight size={16} color={COLORS.muted} />
                    </Pressable>
                  )
                })}

                <View style={styles.sectionRow}>
                  <Link2 size={18} color={ACCENT} />
                  <Text style={styles.section} accessibilityRole="header">
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
                    <Text style={styles.section} accessibilityRole="header">
                      Water, sleep and mood over time
                    </Text>
                    {data.insights.insights.map((i) => (
                      <View key={i.id} style={styles.card}>
                        <Text style={styles.cardName}>{TITLE[i.id]}</Text>
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
    <View style={styles.card}>
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
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  lead: { fontSize: 15, lineHeight: 21, color: COLORS.muted, marginBottom: 4 },
  section: { marginTop: 10, fontSize: 18, fontWeight: '800', color: COLORS.ink },
  sectionRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  muted: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  small: { fontSize: 12, color: COLORS.muted },
  headline: { borderRadius: RADIUS.card, backgroundColor: '#F1EEFB', borderWidth: 1, borderColor: '#DCD5F5', padding: 18, gap: 8 },
  headlineTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headlineTagText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: ACCENT },
  headlineText: { fontSize: 20, fontWeight: '800', lineHeight: 26, color: COLORS.ink },
  card: { borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardName: { fontSize: 14, fontWeight: '800', color: COLORS.ink },
  big: { marginTop: 4, fontSize: 24, fontWeight: '800', color: COLORS.ink },
  facts: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, gap: 4 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { fontSize: 14, color: COLORS.muted },
  factValue: { flexShrink: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: COLORS.ink },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: RADIUS.card, borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.line, padding: 14 },
  connHead: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, color: COLORS.muted },
  togetherSentence: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  pair: { flexDirection: 'row', gap: 8, marginTop: 6 },
  pairBox: { flex: 1, borderRadius: 14, backgroundColor: COLORS.mist, padding: 10, gap: 2, borderWidth: 1, borderColor: 'transparent' },
  pairLabel: { fontSize: 12, color: COLORS.muted },
  pairValue: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  pairSmall: { fontSize: 11, color: COLORS.muted },
})
