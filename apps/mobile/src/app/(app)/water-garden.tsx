import { GROW_TARGET, MOOD_LABEL, SPECIES, computeGarden, plantLine, type Mood } from '@rajs8952/core/garden'
import { effectiveGoal, formatMl } from '@rajs8952/core/hydration'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Bar, Card, Muted, SectionTitle, Status, TrackerScreen } from '@/components/kit'
import { Loader } from '@/components/Loader'
import { PlantArt } from '@/components/PlantArt'
import { PremiumCard } from '@/components/Support'
import { Button, Notice } from '@/components/ui'
import { usePlan } from '@/lib/plan'
import { loadProfile } from '@/lib/profile'
import { COLORS, RADIUS } from '@/lib/theme'
import { messageOf, storage } from '@/lib/trackers'
import { useLoad } from '@/lib/useLoad'

/* ------------------------------------------------------------------
 * Water › Garden, as on the website (Premium): a plant that grows with
 * every water-goal day (@rajs8952/core/garden: one full day = one step,
 * seven to bloom), droops when thirsty, and joins the shelf once it
 * blooms. Everything comes from the daily totals; nothing extra is stored.
 * ------------------------------------------------------------------ */

const MOOD_STYLE: Record<Mood, { bg: string; fg: string }> = {
  thriving: { bg: '#E2F1E3', fg: '#2E7D4F' },
  happy: { bg: COLORS.tide100, fg: COLORS.tide700 },
  thirsty: { bg: '#FFF1D9', fg: '#8A4B0A' },
  wilting: { bg: '#FDECEA', fg: '#B8402B' },
}

async function load() {
  const [profile, totals] = await Promise.all([loadProfile(), storage.water.dailyTotals(400)])
  const goal = effectiveGoal(profile)
  return { goal, totals }
}

export default function WaterGarden() {
  const plan = usePlan()
  const locked = !!plan && !plan.premium
  const { data, error, savedAt, refreshing, refresh, reload } = useLoad(load, 'water-garden')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [now] = useState(() => new Date())

  if (locked) {
    return (
      <TrackerScreen title="Water garden">
        <PremiumCard title="Water garden" text="A plant that grows with every water-goal day is part of Premium." />
      </TrackerScreen>
    )
  }

  const garden = data ? computeGarden(data.totals, data.goal, now) : null

  async function water() {
    setBusy(true)
    setNote(null)
    try {
      await storage.water.add('water', 250)
      setNote({ text: 'Added a glass (250 ml). Your plant drank too.' })
      await reload()
    } catch (e) {
      setNote({ text: messageOf(e), error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TrackerScreen title="Water garden" savedAt={savedAt} refreshing={refreshing} onRefresh={refresh}>
      <Muted>Every drink waters your plant. Hit your goal to help it bloom.</Muted>
      {error && <Notice tone="error">{error}</Notice>}
      {!garden ? (
        <Loader label="Visiting your garden…" />
      ) : (
        <>
          <Card style={styles.plantCard}>
            <View style={styles.plantHead}>
              <View style={{ flex: 1 }}>
                <Muted style={{ fontSize: 13 }}>Plant {garden.current.number}</Muted>
                <Text style={styles.species}>{SPECIES[garden.current.species].name}</Text>
              </View>
              <Text style={[styles.mood, { backgroundColor: MOOD_STYLE[garden.mood].bg, color: MOOD_STYLE[garden.mood].fg }]}>{MOOD_LABEL[garden.mood]}</Text>
            </View>
            <View style={styles.plant} accessible accessibilityLabel={`${SPECIES[garden.current.species].name}, ${garden.current.stage.toLowerCase()}, ${MOOD_LABEL[garden.mood].toLowerCase()}`}>
              <PlantArt species={garden.current.species} fraction={garden.current.fraction} droop={garden.droop} mood={garden.mood} size={220} />
            </View>
            <Text style={styles.says}>“{plantLine(garden.mood, now)}”</Text>
            <View style={{ gap: 6 }}>
              <View style={styles.stageRow}>
                <Text style={styles.stage}>{garden.current.stage}</Text>
                <Muted style={{ fontSize: 13 }}>Next: {garden.current.nextStage}</Muted>
              </View>
              <Bar progress={garden.current.fraction} color="#4F9B5B" />
              <Muted style={{ fontSize: 13 }}>
                About {garden.daysToBloom} more good {garden.daysToBloom === 1 ? 'day' : 'days'} until it blooms.
              </Muted>
            </View>
          </Card>

          <Card>
            <SectionTitle>Drink and water</SectionTitle>
            <Muted>Log a glass of water. Your plant drinks with you. Your goal is {formatMl(data!.goal)} a day.</Muted>
            <Button title="+ A glass of water (250 ml)" onPress={() => void water()} busy={busy} />
            <Status note={note} />
          </Card>

          <Card>
            <SectionTitle right={<Muted>{garden.grown.length}</Muted>}>Bloomed plants</SectionTitle>
            {garden.grown.length === 0 ? (
              <Muted>Your first bloom will appear here. Fully grown plants stay in your garden for good.</Muted>
            ) : (
              <View style={styles.shelf}>
                {garden.grown.map((g, i) => (
                  <View key={`${g.bloomedOn}-${i}`} style={styles.shelfItem} accessible accessibilityLabel={`${SPECIES[g.species].name}, bloomed ${g.bloomedOn}`}>
                    <PlantArt species={g.species} fraction={1} mini size={70} />
                    <Text style={styles.shelfName}>{SPECIES[g.species].name}</Text>
                    <Muted style={{ fontSize: 11 }}>{new Date(g.bloomedOn).toLocaleDateString([], { day: 'numeric', month: 'short' })}</Muted>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card>
            <SectionTitle>How your plant grows</SectionTitle>
            {[
              'Each day adds growth equal to the share of your goal you drank, up to one full day.',
              `${GROW_TARGET} full days grow a seed into a bloom, then a new seed is planted.`,
              'Fall behind and it droops. It never dies, and perks up as soon as you drink.',
            ].map((line) => (
              <Muted key={line}>•  {line}</Muted>
            ))}
          </Card>
        </>
      )}
    </TrackerScreen>
  )
}

const styles = StyleSheet.create({
  plantCard: { gap: 12 },
  plantHead: { flexDirection: 'row', alignItems: 'center' },
  species: { fontSize: 22, fontWeight: '800', color: COLORS.ink },
  mood: { fontSize: 13, fontWeight: '800', paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, overflow: 'hidden' },
  plant: { alignItems: 'center', backgroundColor: '#EAF6FC', borderRadius: 20, paddingTop: 8 },
  says: { fontSize: 15, fontStyle: 'italic', color: COLORS.ink, textAlign: 'center' },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  stage: { fontSize: 15, fontWeight: '800', color: COLORS.ink },
  shelf: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shelfItem: { width: 86, alignItems: 'center', gap: 2 },
  shelfName: { fontSize: 12, fontWeight: '700', color: COLORS.ink },
})
