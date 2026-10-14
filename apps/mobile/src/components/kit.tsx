import DateTimePicker from '@react-native-community/datetimepicker'
import { MAX_BACKDATE_DAYS, hhmm, whenProblem, type WhenChoice } from '@rajs8952/core/when'
import { MOOD_BY_ID, type MoodState } from '@rajs8952/core/mood'
import { Minus, Plus, Trash2 } from 'lucide-react-native'
import { useState, type PropsWithChildren, type ReactNode, type RefObject } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native'
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context'
import Svg, { Circle, Path } from 'react-native-svg'
import { COLORS, RADIUS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Pieces shared by Home and the tracker screens.
 * ------------------------------------------------------------------ */

/**
 * A screen under the navigation header (or, with header={false}, a tab): scrolls, pulls to refresh,
 * and shrinks for the keyboard so the field being typed in stays visible. The sign-in and chat screens
 * work the same way; ScrollView's automaticallyAdjustKeyboardInsets closed the keyboard as it opened.
 */
export function TrackerScreen({
  children,
  refreshing,
  onRefresh,
  scrollRef,
  edges = ['bottom'],
  header = true,
}: PropsWithChildren<{
  refreshing?: boolean
  onRefresh?: () => void
  scrollRef?: RefObject<ScrollView | null>
  /** A tab screen: ['top'] (the tab bar covers the bottom). */
  edges?: Edge[]
  /** Under a navigation header (its height is allowed for when making room for the keyboard). */
  header?: boolean
}>) {
  const insets = useSafeAreaInsets()
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        // iPhone navigation header: the status bar plus 44 pt.
        keyboardVerticalOffset={header ? insets.top + 44 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={COLORS.tide500} colors={[COLORS.tide500]} /> : undefined}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function SectionTitle({ children, right }: PropsWithChildren<{ right?: ReactNode }>) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  )
}

export function Label({ children }: PropsWithChildren) {
  return <Text style={styles.label}>{children}</Text>
}

export function Muted({ children, style }: PropsWithChildren<{ style?: object }>) {
  return <Text style={[styles.muted, style]}>{children}</Text>
}

/** A progress ring (0–1), with whatever goes in the middle. */
export function Ring({ progress, color, size = 64, stroke = 7, children }: PropsWithChildren<{ progress: number | null; color: string; size?: number; stroke?: number }>) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.min(Math.max(progress ?? 0, 0), 1)
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={COLORS.line} strokeWidth={stroke} fill="none" />
        {p > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  )
}

/** A thin progress bar (0–1). */
export function Bar({ progress, color }: { progress: number; color: string }) {
  return (
    <View style={styles.barTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(Math.min(progress, 1) * 100) }}>
      <View style={[styles.barFill, { width: `${Math.min(Math.max(progress, 0), 1) * 100}%`, backgroundColor: color }]} />
    </View>
  )
}

/** A pill that can be selected (single or multiple choice). */
export function Chip({ label, selected, onPress, color = COLORS.ink, icon }: { label: string; selected: boolean; onPress: () => void; color?: string; icon?: ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && { backgroundColor: color, borderColor: color }, pressed && styles.pressed]}
    >
      {icon}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  )
}

export function ChipRow({ children }: PropsWithChildren) {
  return <View style={styles.chipRow}>{children}</View>
}

/** A number with − and + buttons. */
export function Stepper({ value, onChange, step, min, max, format, label }: { value: number; onChange: (v: number) => void; step: number; min: number; max: number; format: (v: number) => string; label: string }) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v * 100) / 100)))
  return (
    <View style={styles.stepper} accessible accessibilityLabel={`${label}: ${format(value)}`} accessibilityRole="adjustable"
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(value + (e.nativeEvent.actionName === 'increment' ? step : -step))}
    >
      <Pressable onPress={() => set(value - step)} disabled={value <= min} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, value <= min && styles.disabled]} hitSlop={6} importantForAccessibility="no">
        <Minus size={20} color={COLORS.ink} />
      </Pressable>
      <Text style={styles.stepValue}>{format(value)}</Text>
      <Pressable onPress={() => set(value + step)} disabled={value >= max} style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, value >= max && styles.disabled]} hitSlop={6} importantForAccessibility="no">
        <Plus size={20} color={COLORS.ink} />
      </Pressable>
    </View>
  )
}

/** "When did this happen?": now, or earlier today / yesterday at a time (the website's rule: up to 7 days back). */
export function WhenPicker({ value, onChange, color, original }: { value: WhenChoice; onChange: (c: WhenChoice) => void; color: string; /** Editing: the entry's own time, offered first. */ original?: string }) {
  const [androidOpen, setAndroidOpen] = useState(false)
  const day = value.day
  const time = value.day === 'today' || value.day === 'yesterday' ? value.time : hhmm(new Date())
  const asDate = () => {
    const [h, m] = time.split(':').map(Number)
    const d = new Date()
    d.setHours(h ?? 0, m ?? 0, 0, 0)
    return d
  }
  const problem = whenProblem(value)
  return (
    <View style={{ gap: 10 }}>
      <ChipRow>
        {original && (
          <Chip
            label={new Date(original).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
            selected={day === 'original'}
            onPress={() => onChange({ day: 'original', iso: original })}
            color={color}
          />
        )}
        {!original && <Chip label="Now" selected={day === 'now'} onPress={() => onChange({ day: 'now' })} color={color} />}
        <Chip label="Earlier today" selected={day === 'today'} onPress={() => onChange({ day: 'today', time })} color={color} />
        <Chip label="Yesterday" selected={day === 'yesterday'} onPress={() => onChange({ day: 'yesterday', time })} color={color} />
      </ChipRow>
      {(day === 'today' || day === 'yesterday') &&
        (Platform.OS === 'ios' ? (
          <View style={styles.timeRow}>
            <Muted>At</Muted>
            <DateTimePicker mode="time" display="compact" value={asDate()} onChange={(_e, d) => d && onChange({ day, time: hhmm(d) })} />
          </View>
        ) : (
          <>
            <Pressable onPress={() => setAndroidOpen(true)} style={styles.timeButton} accessibilityRole="button">
              <Text style={styles.timeText}>At {time}</Text>
            </Pressable>
            {androidOpen && (
              <DateTimePicker
                mode="time"
                value={asDate()}
                onChange={(e, d) => {
                  setAndroidOpen(false)
                  if (e.type === 'set' && d) onChange({ day, time: hhmm(d) })
                }}
              />
            )}
          </>
        ))}
      {problem && <Text style={styles.problem}>{problem}</Text>}
      {!problem && (day === 'today' || day === 'yesterday') && <Muted style={{ fontSize: 13 }}>Entries can be dated up to {MAX_BACKDATE_DAYS} days back.</Muted>}
    </View>
  )
}

/** One saved entry, with a delete button (asks first). */
export function EntryRow({ title, detail, when, onDelete, onEdit, editing, accent }: { title: string; detail?: string | null; when: string; onDelete: () => void; onEdit?: () => void; editing?: boolean; accent: string }) {
  return (
    <View style={[styles.entry, editing && { backgroundColor: `${accent}12` }]}>
      <Pressable
        onPress={onEdit}
        disabled={!onEdit}
        style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}
        accessibilityRole={onEdit ? 'button' : undefined}
        accessibilityLabel={`${title}, ${when}${detail ? `, ${detail}` : ''}`}
        accessibilityHint={onEdit ? 'Edit this entry' : undefined}
      >
        <View style={[styles.entryDot, { backgroundColor: accent }]} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.entryTitle}>{title}</Text>
          {!!detail && <Text style={styles.entryDetail} numberOfLines={2}>{detail}</Text>}
          <Text style={styles.entryWhen}>{editing ? 'Editing above' : when}</Text>
        </View>
      </Pressable>
      <Pressable
        onPress={() =>
          Alert.alert('Delete this entry?', `${title} · ${when}`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
          ])
        }
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${title}, ${when}`}
        style={({ pressed }) => [styles.entryDelete, pressed && styles.pressed]}
      >
        <Trash2 size={18} color={COLORS.muted} />
      </Pressable>
    </View>
  )
}

/** "Today 14:05", "Yesterday 22:30", "Mon 3 Oct, 08:00". */
export function whenLabel(iso: string, now = new Date()) {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((day(now) - day(d)) / 86_400_000)
  if (diff === 0) return `Today ${time}`
  if (diff === 1) return `Yesterday ${time}`
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`
}

/** The website's mood face: the mouth curves from frown (awful) to grin (great). */
export function MoodFace({ mood, size = 40 }: { mood: MoodState; size?: number }) {
  const m = MOOD_BY_ID[mood]
  const curve = (m.score - 3) * 4
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      <Circle cx={20} cy={20} r={18} fill={m.tint} stroke={m.color} strokeWidth={2} />
      {m.score === 1 ? (
        <Path d="M12 15l4 2M28 15l-4 2" stroke={m.color} strokeWidth={2.2} strokeLinecap="round" />
      ) : m.score === 5 ? (
        <Path d="M11.5 17q2.5 -3.5 5 0M23.5 17q2.5 -3.5 5 0" stroke={m.color} strokeWidth={2.2} fill="none" strokeLinecap="round" />
      ) : (
        <>
          <Circle cx={14.5} cy={16.5} r={1.9} fill={m.color} />
          <Circle cx={25.5} cy={16.5} r={1.9} fill={m.color} />
        </>
      )}
      <Path d={`M13 ${26 - curve / 4}Q20 ${26 + curve} 27 ${26 - curve / 4}`} stroke={m.color} strokeWidth={2.4} fill="none" strokeLinecap="round" />
    </Svg>
  )
}

/** A short confirmation ("Saved") or error under a form. */
export function Status({ note }: { note: { text: string; error?: boolean } | null }) {
  if (!note) return null
  return (
    <Text style={[styles.status, note.error && styles.statusError]} accessibilityLiveRegion="polite" accessibilityRole={note.error ? 'alert' : 'text'}>
      {note.text}
    </Text>
  )
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  card: { backgroundColor: COLORS.white, borderRadius: RADIUS.card, borderWidth: 1, borderColor: COLORS.line, padding: 16, gap: 12 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  section: { fontSize: 18, fontWeight: '800', color: COLORS.ink },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  muted: { fontSize: 14, lineHeight: 20, color: COLORS.muted },
  barTrack: { height: 8, borderRadius: 4, backgroundColor: COLORS.mist, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  chipText: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  chipTextOn: { color: COLORS.white },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.35 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 96, textAlign: 'center', fontSize: 22, fontWeight: '800', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: RADIUS.field, borderWidth: 1, borderColor: COLORS.line, backgroundColor: COLORS.white },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  problem: { fontSize: 13, fontWeight: '600', color: COLORS.alert },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.line, borderRadius: 8 },
  entryMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  entryDot: { width: 8, height: 8, borderRadius: 4 },
  entryTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  entryDetail: { fontSize: 13, color: COLORS.muted },
  entryWhen: { fontSize: 12, color: COLORS.muted },
  entryDelete: { padding: 8 },
  status: { fontSize: 14, fontWeight: '700', color: '#2E7D4F' },
  statusError: { color: COLORS.alert },
})

/** The heading and Cancel link of a form while it edits an entry. */
export function EditingBar({ onCancel, color }: { onCancel: () => void; color: string }) {
  return (
    <View style={[editStyles.editing, { backgroundColor: `${color}14` }]}>
      <Text style={[editStyles.editingText, { color }]}>Editing an entry</Text>
      <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button">
        <Text style={editStyles.editingCancel}>Cancel</Text>
      </Pressable>
    </View>
  )
}

const editStyles = StyleSheet.create({
  editing: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  editingText: { fontSize: 13, fontWeight: '800' },
  editingCancel: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
})
