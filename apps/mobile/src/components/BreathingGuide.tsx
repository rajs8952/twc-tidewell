import { BREATH_SECONDS, formatClock } from '@rajs8952/core/meditation'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native'
import { COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * The breathing guide, as on the website's meditation timer: a circle
 * that grows while you breathe in and shrinks while you breathe out,
 * BREATH_SECONDS (4 s) each way. "Breathe in / out" follows the timer's
 * own clock, so it stays in step. Reduce Motion: the words only.
 * ------------------------------------------------------------------ */

export function BreathingGuide({ elapsed, left, color, size = 220 }: { elapsed: number; left: number; color: string; size?: number }) {
  const [scale] = useState(() => new Animated.Value(0.6))
  const [reduce, setReduce] = useState(false)
  const inhaling = Math.floor(elapsed / BREATH_SECONDS) % 2 === 0

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled().then((r) => alive && setReduce(r), () => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => {
      alive = false
      sub.remove()
    }
  }, [])

  // Each half-breath animates toward its end size, so the circle and the words agree.
  useEffect(() => {
    if (reduce) return
    const anim = Animated.timing(scale, { toValue: inhaling ? 1 : 0.6, duration: BREATH_SECONDS * 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
    anim.start()
    return () => anim.stop()
  }, [inhaling, reduce, scale])

  return (
    <View style={[styles.wrap, { width: size, height: size }]} accessible accessibilityRole="timer" accessibilityLabel={`${inhaling ? 'Breathe in' : 'Breathe out'}. ${formatClock(left)} left`} accessibilityLiveRegion="polite">
      <Animated.View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}26`, borderColor: `${color}66`, transform: [{ scale: reduce ? 0.85 : scale }] }]} />
      <View style={[styles.core, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, backgroundColor: color }]} />
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.center}>
          <Text style={styles.phase}>{inhaling ? 'Breathe in' : 'Breathe out'}</Text>
          <Text style={styles.left}>{formatClock(left)}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  circle: { position: 'absolute', borderWidth: 2 },
  core: { position: 'absolute', opacity: 0.9 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phase: { fontSize: 17, fontWeight: '800', color: COLORS.white },
  left: { marginTop: 2, fontSize: 14, fontWeight: '700', color: COLORS.white, fontVariant: ['tabular-nums'] },
})
