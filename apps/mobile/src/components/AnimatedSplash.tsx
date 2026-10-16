import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg'
import { PILLAR_COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * The animated splash, as on the website (apps/web components/pwa/
 * SplashScreen.tsx): on a deep navy background the six pillar petals
 * bloom one by one into the OmniWell flower, the white centre pops in,
 * then the name, tagline and "with The Wellness Corner" rise into view,
 * and the whole screen fades into the app after about 3 seconds.
 *
 * The phone's own splash (app.json) is the same navy with nothing on it,
 * so the hand-over is seamless. "Reduce motion": everything at once,
 * then a short fade.
 * ------------------------------------------------------------------ */

export const SPLASH_BACKGROUND = '#13263B'
const TWC_LOGO = require('../../assets/images/twc-logo.png')

const MARK = 128
const PETAL_R = (6.2 / 32) * MARK
const PETAL_OFFSET = (6.4 / 32) * MARK

/** 0 → 1 over `duration`, starting after `delay` (ms). */
function step(value: Animated.Value, delay: number, duration: number, easing = Easing.out(Easing.cubic)) {
  return Animated.timing(value, { toValue: 1, delay, duration, easing, useNativeDriver: true })
}

export function AnimatedSplash({ start, onDone }: { start: boolean; onDone: () => void }) {
  const { width, height } = useWindowDimensions()
  const [petals] = useState(() => PILLAR_COLORS.map(() => new Animated.Value(0)))
  const [core] = useState(() => new Animated.Value(0))
  const [turn] = useState(() => new Animated.Value(0))
  const [glow] = useState(() => new Animated.Value(0))
  const [name] = useState(() => new Animated.Value(0))
  const [tagline] = useState(() => new Animated.Value(0))
  const [partner] = useState(() => new Animated.Value(0))
  const [out] = useState(() => new Animated.Value(0))

  useEffect(() => {
    if (!start) return
    let alive = true
    let running: Animated.CompositeAnimation | null = null
    AccessibilityInfo.isReduceMotionEnabled().then(
      (reduce) => {
        if (!alive) return
        if (reduce) {
          ;[...petals, core, turn, glow, name, tagline, partner].forEach((v) => v.setValue(1))
          running = step(out, 900, 300, Easing.in(Easing.quad))
        } else {
          running = Animated.parallel([
            step(turn, 0, 1600, Easing.bezier(0.2, 0.7, 0.2, 1)),
            step(glow, 200, 1600),
            ...petals.map((p, i) => step(p, 120 + i * 90, 700, Easing.bezier(0.2, 0.8, 0.2, 1.15))),
            step(core, 750, 450, Easing.linear),
            step(name, 900, 500),
            step(tagline, 1050, 500),
            step(partner, 1300, 500),
            step(out, 2550, 450, Easing.in(Easing.quad)),
          ])
        }
        running.start(({ finished }) => finished && alive && onDone())
      },
      () => onDone(),
    )
    return () => {
      alive = false
      running?.stop()
    }
  }, [start, petals, core, turn, glow, name, tagline, partner, out, onDone])

  const rise = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] })

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity: out.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} pointerEvents="none" accessible accessibilityLabel="OmniWell. Your whole wellbeing, in one place.">
      {/* The website's navy radial background, sized in numbers (percentages didn't always stretch). */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="splashBg" cx={width / 2} cy={0} rx={width * 1.2} ry={height * 0.8} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#1E3A5F" />
            <Stop offset="0.55" stopColor={SPLASH_BACKGROUND} />
            <Stop offset="1" stopColor="#0D1B2A" />
          </RadialGradient>
          {PILLAR_COLORS.map((c) => (
            <RadialGradient key={c} id={`glow${c.slice(1)}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity={0.45} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#splashBg)" />
      </Svg>

      <View style={styles.centre}>
        {/* A soft glow in the six pillar colours behind the flower. */}
        <Animated.View style={[styles.glow, { opacity: glow }]}>
          <Svg width={300} height={300}>
            {PILLAR_COLORS.map((c, i) => {
              const a = (i / PILLAR_COLORS.length) * Math.PI * 2 - Math.PI / 2
              return <Circle key={c} cx={150 + Math.cos(a) * 52} cy={150 + Math.sin(a) * 52} r={110} fill={`url(#glow${c.slice(1)})`} />
            })}
          </Svg>
        </Animated.View>

        <Animated.View
          style={{
            width: MARK,
            height: MARK,
            transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) }, { scale: turn.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          }}
        >
          {PILLAR_COLORS.map((c, i) => {
            const a = (i / PILLAR_COLORS.length) * Math.PI * 2 - Math.PI / 2
            const p = petals[i]!
            return (
              // Each petal turns and grows about the flower's centre, one after another.
              <Animated.View
                key={c}
                style={[
                  StyleSheet.absoluteFill,
                  {
                    opacity: p,
                    transform: [{ rotate: p.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] }) }, { scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }],
                  },
                ]}
              >
                <Svg width={MARK} height={MARK}>
                  <Circle cx={MARK / 2 + Math.cos(a) * PETAL_OFFSET} cy={MARK / 2 + Math.sin(a) * PETAL_OFFSET} r={PETAL_R} fill={c} fillOpacity={0.85} />
                </Svg>
              </Animated.View>
            )
          })}
          <Animated.View
            style={[
              styles.core,
              {
                opacity: core.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
                transform: [{ scale: core.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 1.35, 1] }) }],
              },
            ]}
          />
        </Animated.View>

        <Animated.Text style={[styles.name, rise(name)]}>OmniWell</Animated.Text>
        <Animated.Text style={[styles.tagline, rise(tagline)]}>Your whole wellbeing, in one place</Animated.Text>
      </View>

      <Animated.View style={[styles.partner, rise(partner)]}>
        <Text style={styles.partnerText}>with</Text>
        <Image source={TWC_LOGO} style={styles.partnerLogo} resizeMode="contain" />
        <Text style={styles.partnerText}>The Wellness Corner</Text>
      </Animated.View>
    </Animated.View>
  )
}

const CORE = (2.6 / 32) * MARK * 2

const styles = StyleSheet.create({
  root: { backgroundColor: SPLASH_BACKGROUND, zIndex: 100, elevation: 100 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', width: 300, height: 300, alignSelf: 'center', top: '50%', marginTop: -150 - 40 },
  core: { position: 'absolute', left: (MARK - CORE) / 2, top: (MARK - CORE) / 2, width: CORE, height: CORE, borderRadius: CORE / 2, backgroundColor: '#FFFFFF' },
  name: { marginTop: 22, fontSize: 34, fontWeight: '800', letterSpacing: -0.7, color: '#FFFFFF' },
  tagline: { marginTop: 4, fontSize: 15, color: 'rgba(255,255,255,0.72)' },
  partner: { position: 'absolute', left: 0, right: 0, bottom: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  partnerText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  partnerLogo: { width: 22, height: 22 },
})
