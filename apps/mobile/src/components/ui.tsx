import { useId, useRef, useState, type PropsWithChildren, type ReactNode } from 'react'
import { ActivityIndicator, Image, InputAccessoryView, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg'
import { ScrollerProvider, useRevealOnFocus, useScroller } from '@/lib/revealField'
import { COLORS, PILLAR_COLORS, RADIUS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * Building blocks for the app's screens, in the website's style.
 * ------------------------------------------------------------------ */

/** The OmniWell mark: six overlapping petals, one per pillar. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessible={false}>
      {PILLAR_COLORS.map((fill, i) => {
        const angle = (i / PILLAR_COLORS.length) * Math.PI * 2 - Math.PI / 2
        return <Circle key={fill} cx={16 + Math.cos(angle) * 6.4} cy={16 + Math.sin(angle) * 6.4} r={6.2} fill={fill} fillOpacity={0.72} />
      })}
      <Circle cx={16} cy={16} r={2.6} fill="#FFFFFF" fillOpacity={0.9} />
    </Svg>
  )
}

export function Logo() {
  return (
    <View style={styles.logo} accessibilityRole="header" accessibilityLabel="OmniWell">
      <LogoMark />
      <Text style={styles.logoText}>OmniWell</Text>
    </View>
  )
}

/** The Wellness Corner's logo, shown with OmniWell's on the sign-in screens. */
const TWC_LOGO = require('../../assets/images/twc-logo.png')

/**
 * The sign-in and sign-up screens: a large OmniWell logo, name and tagline
 * over a soft brand wash, then the form on a white card. `compact` shrinks
 * the logo for follow-up steps (codes, new password) so the form fits.
 */
export function AuthScreen({ children, compact = false }: PropsWithChildren<{ compact?: boolean }>) {
  const { scroller, scrollRef, onScroll } = useScroller()
  return (
    <SafeAreaView style={styles.authSafe} edges={['top', 'bottom']}>
      <View style={styles.wash} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <SvgLinearGradient id="wash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#DDF1FB" />
              <Stop offset="0.55" stopColor="#EFECFA" />
              <Stop offset="1" stopColor={COLORS.background} />
            </SvgLinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#wash)" />
        </Svg>
      </View>
      {/* Not automaticallyAdjustKeyboardInsets: with it, iOS closed the keyboard again as it opened. */}
      {/* Android too: with edge-to-edge (Android 15+), the window no longer shrinks for the keyboard by itself. */}
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollerProvider value={scroller}>
        <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={styles.authScroll} keyboardShouldPersistTaps="handled">
          <View style={[styles.hero, compact && styles.heroCompact]} accessible accessibilityRole="header" accessibilityLabel="OmniWell by The Wellness Corner. Your whole wellbeing, in one place.">
            {/* Co-branded: OmniWell × TWC (The Wellness Corner). */}
            <View style={styles.lockup}>
              <View style={[styles.markHalo, compact && styles.markHaloCompact]}>
                <LogoMark size={compact ? 46 : 82} />
              </View>
              <Text style={[styles.times, compact && styles.timesCompact]}>×</Text>
              <View style={[styles.markHalo, compact && styles.markHaloCompact]}>
                <Image source={TWC_LOGO} style={compact ? styles.twcCompact : styles.twc} resizeMode="contain" />
              </View>
            </View>
            <Text style={[styles.brand, compact && styles.brandCompact]}>
              OmniWell <Text style={styles.brandX}>×</Text> TWC
            </Text>
            {!compact && (
              <>
                <Text style={styles.tagline}>Your whole wellbeing, in one place</Text>
                <View style={styles.pillars}>
                  {PILLAR_COLORS.map((c) => (
                    <View key={c} style={[styles.pillar, { backgroundColor: c }]} />
                  ))}
                </View>
              </>
            )}
          </View>
          <View style={styles.authCard}>{children}</View>
        </ScrollView>
        </ScrollerProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/** A scrolling screen that keeps fields clear of the keyboard and the phone's notch. */
export function Screen({ children }: PropsWithChildren) {
  const { scroller, scrollRef, onScroll } = useScroller()
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollerProvider value={scroller}>
          <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </ScrollerProvider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

export function Title({ children }: PropsWithChildren) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  )
}

export function Lead({ children }: PropsWithChildren) {
  return <Text style={styles.lead}>{children}</Text>
}

/** iPhone number keypads have no Return key: number fields get a Done bar above the keypad. */
const NUMERIC = new Set(['number-pad', 'decimal-pad', 'numeric', 'phone-pad'])

/**
 * The Done bar for one number field, rendered next to it (the documented pattern).
 * Not one shared bar at the app's root: re-rendering that while a keyboard was
 * opening made iOS close the keyboard again, on any field.
 */
function DoneBar({ id }: { id: string }) {
  return (
    <InputAccessoryView nativeID={id}>
      <View style={styles.doneBar}>
        <Pressable onPress={() => Keyboard.dismiss()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done, close the keyboard">
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  )
}

/** A labelled text field. `secure` adds a Show/Hide toggle. */
export function Field({ label, secure, right, ...input }: TextInputProps & { label: string; secure?: boolean; right?: ReactNode }) {
  const [shown, setShown] = useState(false)
  const [focused, setFocused] = useState(false)
  const doneId = `done-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const numeric = Platform.OS === 'ios' && !!input.keyboardType && NUMERIC.has(input.keyboardType)
  const wrap = useRef<View>(null)
  const reveal = useRevealOnFocus()
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {right}
      </View>
      <View ref={wrap} style={[styles.inputWrap, focused && styles.inputFocused]}>
        <TextInput
          {...input}
          inputAccessoryViewID={numeric ? doneId : input.inputAccessoryViewID}
          accessibilityLabel={label}
          secureTextEntry={secure && !shown}
          placeholderTextColor={`${COLORS.muted}99`}
          onFocus={(e) => {
            setFocused(true)
            reveal(wrap)
            input.onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            input.onBlur?.(e)
          }}
          style={[styles.input, input.style]}
        />
        {numeric && <DoneBar id={doneId} />}
        {secure && (
          <Pressable onPress={() => setShown((s) => !s)} hitSlop={10} accessibilityRole="button" accessibilityLabel={shown ? 'Hide password' : 'Show password'}>
            <Text style={styles.toggle}>{shown ? 'Hide' : 'Show'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

export function Button({ title, onPress, busy, disabled, variant = 'primary' }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' }) {
  const off = disabled || busy
  const primary = variant === 'primary'
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={({ pressed }) => [styles.button, primary ? styles.buttonPrimary : styles.buttonSecondary, pressed && styles.pressed, off && styles.disabled]}
    >
      {busy && <ActivityIndicator color={primary ? COLORS.white : COLORS.ink} />}
      <Text style={[styles.buttonText, !primary && styles.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  )
}

/** A small text button, like the website's links. */
export function LinkButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      {({ pressed }) => <Text style={[styles.link, pressed && styles.pressedText]}>{title}</Text>}
    </Pressable>
  )
}

export function Notice({ tone, children }: PropsWithChildren<{ tone: 'error' | 'ok' }>) {
  return (
    <View style={[styles.notice, tone === 'error' ? styles.noticeError : styles.noticeOk]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={[styles.noticeText, tone === 'error' ? styles.noticeErrorText : styles.noticeOkText]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 32 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoText: { fontSize: 20, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.3 },
  authSafe: { flex: 1, backgroundColor: COLORS.background },
  wash: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  authScroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 32 },
  hero: { alignItems: 'center', marginBottom: 24 },
  heroCompact: { marginBottom: 16 },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  times: { fontSize: 28, fontWeight: '300', color: COLORS.muted },
  timesCompact: { fontSize: 20 },
  twc: { width: 84, height: 84 },
  twcCompact: { width: 48, height: 48 },
  brandX: { fontWeight: '400', color: COLORS.muted },
  markHalo: { width: 116, height: 116, borderRadius: 58, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F2F37', shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  markHaloCompact: { width: 68, height: 68, borderRadius: 34 },
  brand: { marginTop: 14, fontSize: 32, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.6, textAlign: 'center' },
  brandCompact: { marginTop: 8, fontSize: 24 },
  tagline: { marginTop: 4, fontSize: 16, color: COLORS.muted },
  pillars: { flexDirection: 'row', gap: 6, marginTop: 14 },
  pillar: { width: 18, height: 6, borderRadius: 3 },
  authCard: { backgroundColor: COLORS.white, borderRadius: 28, borderWidth: 1, borderColor: COLORS.line, padding: 22, shadowColor: '#0F2F37', shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 2 },
  title: { fontSize: 30, fontWeight: '800', color: COLORS.ink, letterSpacing: -0.5 },
  lead: { marginTop: 8, fontSize: 16, lineHeight: 23, color: COLORS.muted },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: RADIUS.field,
    backgroundColor: COLORS.white,
    paddingHorizontal: 16,
  },
  // Android: the border colour only. Changing shadow props on the field's wrapper as it gains focus can make Android drop that focus again.
  inputFocused: Platform.OS === 'ios' ? { borderColor: COLORS.tide500, shadowColor: COLORS.tide200, shadowOpacity: 0.9, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } } : { borderColor: COLORS.tide500 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: COLORS.ink },
  toggle: { fontSize: 14, fontWeight: '700', color: COLORS.tide600 },
  button: { minHeight: 52, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 20 },
  buttonPrimary: { backgroundColor: COLORS.ink },
  buttonSecondary: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.line },
  buttonText: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  buttonTextSecondary: { color: COLORS.ink },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
  link: { fontSize: 14, fontWeight: '700', color: COLORS.tide600 },
  pressedText: { opacity: 0.6 },
  doneBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#F1F3F4', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#C8CDD0' },
  doneText: { fontSize: 17, fontWeight: '700', color: COLORS.tide600 },
  notice: { borderRadius: RADIUS.field, paddingHorizontal: 16, paddingVertical: 12 },
  noticeError: { backgroundColor: COLORS.alertBg },
  noticeOk: { backgroundColor: COLORS.tide100 },
  noticeText: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  noticeErrorText: { color: COLORS.alert },
  noticeOkText: { color: COLORS.tide700 },
})
