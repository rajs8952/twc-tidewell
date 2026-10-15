import { PROGRAMMES, programmeState } from '@omniwell/web/content/programmes'
import { FREE_PROGRAMME } from '@omniwell/web/plans'
import { router, type Href } from 'expo-router'
import { Check, ChevronRight } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Muted, TrackerScreen } from '@/components/kit'
import { Notice } from '@/components/ui'
import { usePlan } from '@/lib/plan'
import { useProfile } from '@/lib/profile'
import { NOT_ADVICE, useProgrammes } from '@/lib/programmes'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS } from '@/lib/trackers'

/** Every programme with your progress, the ones matching your focus first (as on the website). */
export default function Programmes() {
  const { enrolments, error } = useProgrammes()
  const { profile } = useProfile()
  const free = usePlan()?.premium === false
  const focus = profile?.focus_trackers ?? []
  const ordered = [...PROGRAMMES].sort((a, b) => Number(focus.includes(b.topic)) - Number(focus.includes(a.topic)))

  return (
    <TrackerScreen title={'Programmes'}>
      <Muted>One small step a day, for a week or less.</Muted>
      {error && <Notice tone="error">{error}</Notice>}
      {ordered.map((p) => {
        const t = TRACKERS[p.topic]
        const Icon = t.icon
        const e = enrolments?.[p.id]
        const s = e ? programmeState(p, e) : null
        const status = !s ? `${p.days.length} days` : s.finished ? 'Finished' : s.next ? `Day ${s.next} of ${p.days.length} is ready` : `${s.done.size} of ${p.days.length} days done · next day unlocks tomorrow`
        return (
          <Pressable key={p.id} onPress={() => router.push(`/programme/${p.id}` as Href)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]} accessibilityRole="button" accessibilityLabel={`${p.title}. ${p.summary} ${status}`}>
            <View style={[styles.icon, { backgroundColor: t.accent }]}>
              <Icon size={24} color={COLORS.white} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <View style={styles.titleRow}>
                <Text style={styles.title}>{p.title}</Text>
                {free && p.id !== FREE_PROGRAMME && <Text style={styles.premium}>PREMIUM</Text>}
                {focus.includes(p.topic) && <Text style={styles.forYou}>FOR YOU</Text>}
              </View>
              <Text style={styles.summary}>{p.summary}</Text>
              {s && (
                <View style={styles.dots}>
                  {p.days.map((_, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: s.done.has(i + 1) ? t.accent : COLORS.line }]} />
                  ))}
                </View>
              )}
              <View style={styles.statusRow}>
                {s?.finished && <Check size={14} color="#2E7D4F" strokeWidth={3} />}
                <Text style={[styles.status, s?.finished && { color: '#2E7D4F' }, s?.next ? { color: COLORS.ink } : null]}>{status}</Text>
              </View>
            </View>
            <ChevronRight size={20} color={COLORS.muted} />
          </Pressable>
        )
      })}
      <Muted style={{ fontSize: 12 }}>{NOT_ADVICE}</Muted>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 16 },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  premium: { fontSize: 10, fontWeight: '800', color: '#8A4B0A', backgroundColor: '#FFF1D9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  forYou: { fontSize: 10, fontWeight: '800', color: COLORS.muted, backgroundColor: COLORS.mist, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  summary: { fontSize: 14, color: COLORS.muted },
  dots: { flexDirection: 'row', gap: 4, marginTop: 4 },
  dot: { flex: 1, height: 6, borderRadius: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  status: { fontSize: 12, fontWeight: '700', color: COLORS.muted },
})
