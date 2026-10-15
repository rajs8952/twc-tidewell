import { useState } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { COLORS } from '@/lib/theme'

/* ------------------------------------------------------------------
 * A week as seven bars (Monday to Sunday), for Water Stats and the
 * trackers' "This week" charts. One measure, one axis: bars grow from the
 * baseline with rounded tops; stacked parts are split by a 2 px gap; an
 * optional dashed goal line. Tap a bar to see its value (and its parts).
 * Labels stay in text colours; colour only marks what each part is.
 * ------------------------------------------------------------------ */

export interface BarPart {
  value: number
  color: string
  label?: string
}

export interface BarDay {
  key: string
  /** "Mon" */
  label: string
  value: number
  /** Stacked parts (e.g. drinks); one part in `color` when omitted. */
  parts?: BarPart[]
  isToday?: boolean
  isFuture?: boolean
}

const H = 160
const TOP = 18
const BOTTOM = 22

export function WeekBars({ days, color, goal, goalLabel, format, summary }: { days: BarDay[]; color: string; goal?: number | null; goalLabel?: string; format: (v: number) => string; summary: string }) {
  const { width: screen } = useWindowDimensions()
  const w = screen - 32 - 34 // screen and card padding
  const [picked, setPicked] = useState<string | null>(null)
  const max = Math.max(goal ?? 0, ...days.map((d) => d.value), 1) * 1.1
  const slot = w / days.length
  const barW = Math.min(28, slot * 0.56)
  const y = (v: number) => TOP + (1 - v / max) * (H - TOP - BOTTOM)
  const base = H - BOTTOM
  const pick = days.find((d) => d.key === picked)

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary}>
      <View style={styles.readout}>
        {pick ? (
          <Text style={styles.readoutText}>
            <Text style={styles.readoutStrong}>{pick.label}: {format(pick.value)}</Text>
            {pick.parts && pick.parts.length > 1 ? `  ·  ${pick.parts.map((p) => `${p.label} ${format(p.value)}`).join(', ')}` : ''}
          </Text>
        ) : (
          <Text style={styles.readoutHint}>Tap a day to see its total</Text>
        )}
      </View>
      <View>
        <Svg width={w} height={H}>
          {/* Recessive baseline and goal. */}
          <Line x1={0} x2={w} y1={base} y2={base} stroke={COLORS.line} strokeWidth={1} />
          {!!goal && (
            <>
              <Line x1={0} x2={w} y1={y(goal)} y2={y(goal)} stroke={COLORS.muted} strokeWidth={1} strokeDasharray="4 4" />
              <SvgText x={w} y={y(goal) - 4} fontSize={10} fill={COLORS.muted} textAnchor="end">
                {goalLabel ?? `Goal ${format(goal)}`}
              </SvgText>
            </>
          )}
          {days.map((d, i) => {
            const x = i * slot + (slot - barW) / 2
            const parts = d.parts?.length ? d.parts : d.value > 0 ? [{ value: d.value, color }] : []
            let top = base
            const dim = picked && picked !== d.key ? 0.45 : 1
            return (
              <G key={d.key}>
                {parts.map((p, k) => {
                  const h = Math.max(0, base - y(p.value))
                  const gap = k > 0 ? 2 : 0
                  top -= h
                  const last = k === parts.length - 1
                  const bh = Math.max(0, h - gap)
                  return last ? <Path key={k} d={topRounded(x, top, barW, bh, 4)} fill={p.color} opacity={dim} /> : <Rect key={k} x={x} y={top} width={barW} height={bh} fill={p.color} opacity={dim} />
                })}
                <SvgText x={x + barW / 2} y={H - 6} fontSize={11} fontWeight={d.isToday ? '800' : '500'} fill={d.isToday ? COLORS.ink : COLORS.muted} textAnchor="middle">
                  {d.label}
                </SvgText>
              </G>
            )
          })}
        </Svg>
        {/* Tap targets wider than the bars. */}
        <View style={[StyleSheet.absoluteFill, styles.hits]}>
          {days.map((d) => (
            <Pressable key={d.key} style={{ width: slot, height: H }} onPress={() => setPicked((p) => (p === d.key ? null : d.key))} disabled={d.isFuture} accessibilityElementsHidden importantForAccessibility="no" />
          ))}
        </View>
      </View>
    </View>
  )
}

/** A bar with rounded top corners and a flat base on the baseline. */
function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h)
  return `M${x} ${y + h}V${y + rr}Q${x} ${y} ${x + rr} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h}Z`
}

const styles = StyleSheet.create({
  readout: { minHeight: 22, justifyContent: 'center', marginBottom: 4 },
  readoutText: { fontSize: 13, color: COLORS.muted },
  readoutStrong: { fontWeight: '800', color: COLORS.ink },
  readoutHint: { fontSize: 12, color: COLORS.muted },
  hits: { flexDirection: 'row' },
})
