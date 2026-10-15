import { addDays, dayKey, startOfWeek } from '@rajs8952/core/dates'
import { BEVERAGES, BEVERAGE_ORDER, effectiveGoal } from '@rajs8952/core/hydration'
import { ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useCallback, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Bar, Card, Muted, SectionTitle, TrackerScreen } from '@/components/kit'
import { Loader } from '@/components/Loader'
import { Notice } from '@/components/ui'
import { WeekBars, type BarDay } from '@/components/WeekBars'
import { loadProfile } from '@/lib/profile'
import { COLORS, RADIUS } from '@/lib/theme'
import { storage } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

/* ------------------------------------------------------------------
 * Water › Stats, as on the website (packages/tracker-water/WaterStats):
 * a week's hydration per day and per drink, any week back. Amounts are
 * what counts toward the goal, after each drink's share is applied.
 * ------------------------------------------------------------------ */

const litres = (ml: number, digits = 1) => `${(ml / 1000).toFixed(digits)} L`

function weekTitle(offset: number, start: Date) {
  if (offset === 0) return 'This week'
  if (offset === -1) return 'Last week'
  const fmt = (d: Date) => d.toLocaleDateString([], { day: 'numeric', month: 'short' })
  return `${fmt(start)} – ${fmt(addDays(start, 6))}`
}

export default function WaterStats() {
  const [offset, setOffset] = useState(0)
  const load = useCallback(async () => {
    const start = addDays(startOfWeek(new Date()), offset * 7)
    const [profile, logs] = await Promise.all([loadProfile(), storage.water.list(start, addDays(start, 7))])
    return { goal: effectiveGoal(profile), logs, start: start.toISOString() }
  }, [offset])
  const { data, error, savedAt, refreshing, refresh } = useLoad(load, `water-stats-${offset}`)
  const [now] = useState(() => new Date())

  const current = data && data.start === addDays(startOfWeek(now), offset * 7).toISOString() ? data : null
  const start = addDays(startOfWeek(now), offset * 7)
  const todayKey = dayKey(now)
  const days: BarDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i)
    const k = dayKey(d)
    const of = (current?.logs ?? []).filter((l) => dayKey(new Date(l.logged_at)) === k)
    const parts = BEVERAGE_ORDER.map((id) => ({ value: of.filter((l) => l.beverage === id).reduce((s, l) => s + l.effective_ml, 0), color: BEVERAGES[id].color, label: BEVERAGES[id].label })).filter((p) => p.value > 0)
    return { key: k, label: d.toLocaleDateString([], { weekday: 'short' }), value: parts.reduce((s, p) => s + p.value, 0), parts, isToday: k === todayKey, isFuture: d > now }
  })
  const goal = current?.goal ?? 0
  const elapsed = days.filter((d) => !d.isFuture).length || 1
  const total = days.reduce((s, d) => s + d.value, 0)
  const goalDays = days.filter((d) => goal && d.value >= goal).length
  const best = days.reduce((a, b) => (b.value > a.value ? b : a), days[0]!)
  const shares = BEVERAGE_ORDER.map((id) => {
    const of = (current?.logs ?? []).filter((l) => l.beverage === id)
    return { id, effective: of.reduce((s, l) => s + l.effective_ml, 0), volume: of.reduce((s, l) => s + l.amount_ml, 0) }
  })
    .filter((s) => s.volume > 0)
    .sort((a, b) => b.effective - a.effective)
  const stats = [
    { label: 'Daily average', value: litres(Math.round(total / elapsed), 2) },
    { label: 'Goal reached', value: `${goalDays} of ${elapsed} ${elapsed === 1 ? 'day' : 'days'}` },
    { label: 'Week total', value: litres(total) },
    { label: 'Best day', value: best.value ? `${best.label}, ${litres(best.value)}` : 'None yet' },
  ]

  return (
    <TrackerScreen title="Water stats" savedAt={savedAt} refreshing={refreshing} onRefresh={refresh}>
      <View style={styles.weekNav}>
        <Pressable onPress={() => setOffset((o) => o - 1)} hitSlop={8} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous week">
          <ChevronLeft size={20} color={COLORS.ink} />
        </Pressable>
        <Text style={styles.week} accessibilityLiveRegion="polite">
          {weekTitle(offset, start)}
        </Text>
        <Pressable onPress={() => setOffset((o) => Math.min(o + 1, 0))} disabled={offset === 0} hitSlop={8} style={[styles.navBtn, offset === 0 && { opacity: 0.3 }]} accessibilityRole="button" accessibilityLabel="Next week">
          <ChevronRight size={20} color={COLORS.ink} />
        </Pressable>
      </View>
      {error && <Notice tone="error">{error}</Notice>}

      {!current ? (
        <Loader compact size={40} label={null} />
      ) : (
        <>
          <View style={styles.grid}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Muted style={{ fontSize: 13 }}>{s.label}</Muted>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>

          <Card>
            <SectionTitle>Daily totals</SectionTitle>
            <WeekBars
              days={days}
              color={BEVERAGES.water.color}
              goal={goal}
              format={(v) => litres(v)}
              summary={`Water each day ${weekTitle(offset, start).toLowerCase()}: ${days.map((d) => `${d.label} ${litres(d.value)}`).join(', ')}. Goal ${litres(goal)}.`}
            />
            {shares.length > 0 && (
              <View style={styles.legend}>
                {shares.map((s) => (
                  <View key={s.id} style={styles.legendItem}>
                    <View style={[styles.dot, { backgroundColor: BEVERAGES[s.id].color }]} />
                    <Text style={styles.legendText}>{BEVERAGES[s.id].label}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <SectionTitle>What you drank</SectionTitle>
            {!shares.length && <Muted>Nothing logged this week.</Muted>}
            {shares.map((s) => (
              <View key={s.id} style={{ gap: 4 }}>
                <View style={styles.shareRow}>
                  <Text style={styles.shareLabel}>{BEVERAGES[s.id].label}</Text>
                  <Text style={styles.shareValue}>
                    {litres(s.effective)}
                    {s.volume !== s.effective ? <Text style={styles.shareMuted}> of {litres(s.volume)}</Text> : null}
                  </Text>
                </View>
                <Bar progress={total ? s.effective / total : 0} color={BEVERAGES[s.id].color} />
              </View>
            ))}
          </Card>
        </>
      )}
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.white, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.line, padding: 4 },
  navBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  week: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '47%', flexGrow: 1, backgroundColor: COLORS.white, borderRadius: 18, borderWidth: 1, borderColor: COLORS.line, padding: 14, gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.ink },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
  shareRow: { flexDirection: 'row', justifyContent: 'space-between' },
  shareLabel: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  shareValue: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  shareMuted: { fontWeight: '500', color: COLORS.muted },
})
