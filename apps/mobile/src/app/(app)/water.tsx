import { addDays, computeStreaks, startOfDay } from '@rajs8952/core/dates'
import { BEVERAGES, BEVERAGE_ORDER, PRESETS, effectiveGoal, formatMl, motivationalMessage, type BeverageId } from '@rajs8952/core/hydration'
import { whenProblem, whenToIso, type WhenChoice } from '@rajs8952/core/when'
import type { DrinkLog } from '@rajs8952/core/types'
import { useRef, useState } from 'react'
import type { ScrollView } from 'react-native'
import { StyleSheet, Text } from 'react-native'
import { Card, Chip, ChipRow, EditingBar, EntryRow, Label, Muted, Ring, SectionTitle, Status, TrackerScreen, WhenPicker, whenLabel } from '@/components/kit'
import { Button, Field, Notice } from '@/components/ui'
import { Loader } from '@/components/Loader'
import { loadProfile } from '@/lib/profile'
import { COLORS } from '@/lib/theme'
import { TRACKERS, messageOf, storage } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

const ACCENT = TRACKERS.water.accent

async function load() {
  const today = startOfDay(new Date())
  const [profile, drinks, totals] = await Promise.all([
    loadProfile(),
    storage.water.list(today, addDays(today, 1)),
    storage.water.dailyTotals(400).catch(() => ({}) as Record<string, number>),
  ])
  return { goal: effectiveGoal(profile), drinks, totals }
}

/** Water › Today: progress toward the personal goal, logging a drink, and today's drinks. */
export default function Water() {
  const { data, error, refreshing, refresh, reload } = useLoad(load)
  const [beverage, setBeverage] = useState<BeverageId>('water')
  const [ml, setMl] = useState(250)
  const [custom, setCustom] = useState('')
  const [when, setWhen] = useState<WhenChoice>({ day: 'now' })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  /** The drink being edited, if any (the form above then changes it instead of adding one). */
  const [editing, setEditing] = useState<DrinkLog | null>(null)
  const scroll = useRef<ScrollView>(null)

  const total = data?.drinks.reduce((s, d) => s + d.effective_ml, 0) ?? 0
  const progress = data?.goal ? total / data.goal : 0
  // Days in a row reaching the goal, as on the website's Water page.
  const streak = data ? computeStreaks(data.totals, data.goal) : null
  const amount = custom ? Number(custom) : ml
  const bev = BEVERAGES[beverage]

  function edit(d: DrinkLog) {
    setEditing(d)
    setBeverage(d.beverage)
    const preset = PRESETS.some((p) => p.ml === d.amount_ml)
    setMl(preset ? d.amount_ml : 250)
    setCustom(preset ? '' : String(d.amount_ml))
    setWhen({ day: 'original', iso: d.logged_at })
    setNote(null)
    scroll.current?.scrollTo({ y: 0, animated: true })
  }

  function stopEditing() {
    setEditing(null)
    setCustom('')
    setWhen({ day: 'now' })
  }

  async function add() {
    if (!Number.isInteger(amount) || amount < 10 || amount > 3000) return setNote({ text: 'Enter an amount between 10 and 3,000 ml.', error: true })
    const problem = whenProblem(when)
    if (problem) return setNote({ text: problem, error: true })
    setBusy(true)
    setNote(null)
    try {
      if (editing) {
        await storage.water.update(editing.id, { beverage, amountMl: amount, loggedAt: whenToIso(when) })
        setNote({ text: 'Drink updated.' })
        stopEditing()
      } else {
        const saved = await storage.water.add(beverage, amount, whenToIso(when))
        setNote({ text: `Added ${formatMl(saved.amount_ml)} of ${bev.label.toLowerCase()}` })
        setCustom('')
        setWhen({ day: 'now' })
      }
      await reload()
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await storage.water.remove(id)
      if (editing?.id === id) stopEditing()
      await reload()
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    }
  }

  return (
    <TrackerScreen refreshing={refreshing} onRefresh={refresh} scrollRef={scroll}>
      {error && <Notice tone="error">{error}</Notice>}

      <Card style={styles.hero}>
        <Ring progress={progress} color={ACCENT} size={168} stroke={14}>
          <Text style={styles.total}>{formatMl(total)}</Text>
          <Muted>of {data ? formatMl(data.goal) : '…'}</Muted>
        </Ring>
        <Text style={styles.message}>{motivationalMessage(Math.min(progress, 1))}</Text>
        {streak && (
          <Muted>
            {streak.current ? `${streak.current}-day streak` : 'No streak yet'} · best {streak.best} {streak.best === 1 ? 'day' : 'days'}
          </Muted>
        )}
      </Card>

      <Card>
        <SectionTitle>{editing ? 'Edit drink' : 'Log a drink'}</SectionTitle>
        {editing && <EditingBar onCancel={stopEditing} color={ACCENT} />}
        <Label>Drink</Label>
        <ChipRow>
          {BEVERAGE_ORDER.map((id) => (
            <Chip key={id} label={BEVERAGES[id].label} selected={beverage === id} onPress={() => setBeverage(id)} color={BEVERAGES[id].color} />
          ))}
        </ChipRow>
        {bev.multiplier < 1 && <Muted>{bev.label} counts {Math.round(bev.multiplier * 100)}% toward your goal.</Muted>}
        <Label>Amount</Label>
        <ChipRow>
          {PRESETS.map((p) => (
            <Chip
              key={p.ml}
              label={`${p.label} · ${p.ml} ml`}
              selected={!custom && ml === p.ml}
              onPress={() => {
                setMl(p.ml)
                setCustom('')
              }}
              color={ACCENT}
            />
          ))}
        </ChipRow>
        <Field label="Or another amount (ml)" value={custom} onChangeText={(t) => setCustom(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="e.g. 400" />
        <Label>When</Label>
        <WhenPicker value={when} onChange={setWhen} color={ACCENT} original={editing?.logged_at} />
        <Button title={editing ? 'Save changes' : `Add ${Number.isFinite(amount) && amount ? formatMl(amount) : ''}`} onPress={() => void add()} busy={busy} />
        <Status note={note} />
      </Card>

      <Card>
        <SectionTitle>Today</SectionTitle>
        {!data && !error && <Loader compact size={36} label={null} />}
        {data && !data.drinks.length && <Muted>Nothing yet today. Your first glass starts the day.</Muted>}
        {data?.drinks.map((d) => (
          <EntryRow
            key={d.id}
            accent={BEVERAGES[d.beverage].color}
            title={`${BEVERAGES[d.beverage].label} · ${formatMl(d.amount_ml)}`}
            detail={d.multiplier < 1 ? `Counts ${formatMl(d.effective_ml)}` : null}
            when={whenLabel(d.logged_at)}
            onDelete={() => void remove(d.id)}
            onEdit={() => edit(d)}
            editing={editing?.id === d.id}
          />
        ))}
      </Card>
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: 24, gap: 14 },
  total: { fontSize: 28, fontWeight: '800', color: COLORS.ink, fontVariant: ['tabular-nums'] },
  message: { fontSize: 15, fontWeight: '600', color: COLORS.ink, textAlign: 'center' },
})
