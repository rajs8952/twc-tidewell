import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { COLORS, PILLAR_COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * OmniWell's loader: the logo's six petals, slowly turning and breathing.
 * With Reduce Motion on, it only fades gently. Used wherever a whole
 * screen or section is loading; buttons keep their small spinner.
 * ------------------------------------------------------------------ */

const TURN_MS = 2400
const BREATH_MS = 1200

export function Loader({ size = 56, label = 'Loading…', compact = false }: { size?: number; label?: string | null; compact?: boolean }) {
  // Created once per loader (state, not refs, so the React Compiler can follow them).
  const [turn] = useState(() => new Animated.Value(0))
  const [breath] = useState(() => new Animated.Value(0))
  const [reduce, setReduce] = useState(false)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r), () => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  useEffect(() => {
    const loops = [
      Animated.loop(Animated.sequence([Animated.timing(breath, { toValue: 1, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(breath, { toValue: 0, duration: BREATH_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])),
      ...(reduce ? [] : [Animated.loop(Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }))]),
    ]
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, [reduce, turn, breath])

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] })
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: reduce ? [1, 1] : [0.88, 1.04] })
  const opacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] })

  return (
    <View style={[styles.wrap, compact && styles.compact]} accessible accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'}>
      <Animated.View style={{ width: size, height: size, opacity, transform: [{ rotate }, { scale }] }}>
        <Svg width={size} height={size} viewBox="0 0 32 32">
          {PILLAR_COLORS.map((fill, i) => {
            const angle = (i / PILLAR_COLORS.length) * Math.PI * 2 - Math.PI / 2
            return <Circle key={fill} cx={16 + Math.cos(angle) * 6.4} cy={16 + Math.sin(angle) * 6.4} r={6.2} fill={fill} fillOpacity={0.72} />
          })}
          <Circle cx={16} cy={16} r={2.6} fill="#FFFFFF" fillOpacity={0.9} />
        </Svg>
      </Animated.View>
      {!!label && <Text style={styles.label}>{label}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
  compact: { paddingVertical: 16, gap: 8 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.muted },
})
