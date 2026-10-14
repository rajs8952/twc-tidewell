import { PROGRAMME_BY_ID, programmeState } from '@omniwell/web/content/programmes'
import { FREE_PROGRAMME } from '@omniwell/web/plans'
import { Stack, router, useLocalSearchParams, type Href } from 'expo-router'
import { ArrowRight, Check, Lock, RotateCcw } from 'lucide-react-native'
import { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { Muted, TrackerScreen } from '@/components/kit'
import { PremiumCard } from '@/components/Support'
import { Button, Notice } from '@/components/ui'
import { usePlan } from '@/lib/plan'
import { NOT_ADVICE, appHref, useProgrammes } from '@/lib/programmes'
import { COLORS, RADIUS } from '@/lib/theme'
import { TRACKERS } from '@/lib/trackers'

/** One programme: its days, today's step open, marking days done (as on the website's ProgrammeView). */
export default function Programme() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const p = PROGRAMME_BY_ID[id ?? '']
  const { enrolments, error, start, setDay, leave } = useProgrammes()
  const plan = usePlan()
  const [busy, setBusy] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null | undefined>(undefined)

  if (!p) {
    return (
      <TrackerScreen>
        <Notice tone="error">That programme wasn’t found.</Notice>
      </TrackerScreen>
    )
  }
  const t = TRACKERS[p.topic]
  const Icon = t.icon
  const e = enrolments?.[p.id]
  const s = e ? programmeState(p, e) : null
  // Every programme except the free one is Premium (the database enforces it too).
  const locked = !!plan && !plan.premium && p.id !== FREE_PROGRAMME
  // Today's step is open until they choose another.
  const shown = open === undefined ? (s?.next ?? (s ? null : 1)) : open

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key)
    await fn()
    setBusy(null)
  }

  return (
    <TrackerScreen>
      <Stack.Screen options={{ title: p.title }} />
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: t.accent }]}>
          <Icon size={28} color={COLORS.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{p.title}</Text>
          <Muted>{p.summary}</Muted>
          {s && <Text style={styles.progress}>{s.finished ? 'Finished. Well done!' : `${s.done.size} of ${p.days.length} days done`}</Text>}
        </View>
      </View>

      {error && <Notice tone="error">{error}</Notice>}
      {locked && <PremiumCard title={p.title} text="All programmes except Hydration kickstart are part of Premium." />}

      {enrolments && !e && !locked && (
        <View style={styles.startCard}>
          <Text style={styles.dayTitle}>{p.days.length} days, one small step each day</Text>
          <Muted>A new day unlocks each day after you start. Take your time; you can do a day later if you miss one.</Muted>
          <Button title="Start today" onPress={() => void run('start', () => start(p.id))} busy={busy === 'start'} disabled={busy !== null} />
        </View>
      )}

      {p.days.map((d, i) => {
        const n = i + 1
        const dayLocked = locked || !s || n > s.unlocked
        const done = !!s?.done.has(n)
        const expanded = shown === n && !dayLocked
        return (
          <View key={n} style={styles.day}>
            <Pressable
              onPress={() => setOpen(expanded ? null : n)}
              disabled={dayLocked}
              style={styles.dayHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: dayLocked ? undefined : expanded, disabled: dayLocked }}
              accessibilityLabel={`Day ${n}: ${d.title}${done ? ', done' : dayLocked ? (s ? ', unlocks on a later day' : ', start the programme to unlock') : ''}`}
            >
              <View style={[styles.badge, done ? { backgroundColor: t.accent } : dayLocked ? { backgroundColor: COLORS.mist } : { borderWidth: 2, borderColor: t.accent }]}>
                {done ? <Check size={16} color={COLORS.white} strokeWidth={3} /> : dayLocked ? <Lock size={14} color={COLORS.muted} /> : <Text style={[styles.badgeText, { color: t.accent }]}>{n}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayLabel}>DAY {n}</Text>
                <Text style={[styles.dayTitle, dayLocked && { color: COLORS.muted }]}>{d.title}</Text>
              </View>
            </Pressable>
            {expanded && (
              <View style={styles.dayBody}>
                <Text style={styles.body}>{d.body}</Text>
                <View style={[styles.step, { backgroundColor: `${t.accent}14` }]}>
                  <Text style={[styles.stepLabel, { color: t.accent }]}>TODAY’S STEP</Text>
                  <Text style={styles.stepText}>{d.action}</Text>
                </View>
                <View style={styles.row}>
                  <Pressable
                    onPress={() =>
                      void run(`day-${n}`, async () => {
                        const ok = await setDay(p.id, n, !done)
                        // Close the day once it's done, so the next one is easy to find.
                        if (ok && !done) setOpen(null)
                      })
                    }
                    disabled={busy !== null}
                    style={({ pressed }) => [styles.markBtn, done ? styles.markDone : { backgroundColor: COLORS.ink }, pressed && { opacity: 0.85 }]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: done }}
                  >
                    <Check size={18} color={done ? COLORS.ink : COLORS.white} />
                    <Text style={[styles.markText, done && { color: COLORS.ink }]}>{done ? 'Done · undo' : 'Mark as done'}</Text>
                  </Pressable>
                  {d.link && (
                    <Pressable onPress={() => router.push(appHref(d.link!.href) as Href)} style={styles.linkBtn} accessibilityRole="button">
                      <Text style={styles.linkText}>{d.link.label}</Text>
                      <ArrowRight size={16} color={COLORS.ink} />
                    </Pressable>
                  )}
                </View>
              </View>
            )}
          </View>
        )
      })}

      {e && !locked && (
        <View style={styles.row}>
          <Pressable
            onPress={() =>
              Alert.alert(`Start ${p.title} again?`, 'You’ll begin from day 1 and your ticks will be cleared.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Start again', onPress: () => void run('restart', () => start(p.id)).then(() => setOpen(1)) },
              ])
            }
            style={styles.linkBtn}
            accessibilityRole="button"
          >
            <RotateCcw size={16} color={COLORS.ink} />
            <Text style={styles.linkText}>Start again</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert(`Leave ${p.title}?`, 'Your progress in it will be removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Leave', style: 'destructive', onPress: () => void run('leave', () => leave(p.id)).then(() => router.back()) },
              ])
            }
            style={styles.linkBtn}
            accessibilityRole="button"
          >
            <Text style={[styles.linkText, { color: COLORS.alert }]}>Leave programme</Text>
          </Pressable>
        </View>
      )}
      <Muted style={{ fontSize: 12 }}>{NOT_ADVICE}</Muted>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontWeight: '800', color: COLORS.ink },
  progress: { marginTop: 4, fontSize: 14, fontWeight: '800', color: COLORS.ink },
  startCard: { borderRadius: RADIUS.card, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 10 },
  day: { borderRadius: 20, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '800' },
  dayLabel: { fontSize: 11, fontWeight: '800', color: COLORS.muted, letterSpacing: 0.6 },
  dayTitle: { fontSize: 16, fontWeight: '800', color: COLORS.ink },
  dayBody: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, padding: 14, gap: 12 },
  body: { fontSize: 15, lineHeight: 22, color: COLORS.ink },
  step: { borderRadius: 14, padding: 12, gap: 2 },
  stepLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  stepText: { fontSize: 15, fontWeight: '700', lineHeight: 21, color: COLORS.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  markBtn: { minHeight: 44, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  markDone: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  markText: { fontSize: 15, fontWeight: '700', color: COLORS.white },
  linkBtn: { minHeight: 44, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  linkText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
})
