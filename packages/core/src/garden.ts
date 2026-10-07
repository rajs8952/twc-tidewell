/* ------------------------------------------------------------------
 * OmniWell garden: a plant that grows as you hit your water goal.
 * Everything is derived from daily totals, so nothing extra is stored.
 * ------------------------------------------------------------------ */

import { addDays, dayKey, parseDayKey, startOfDay } from './dates'

/** Growth a plant needs to bloom. One fully hydrated day = 1. */
export const GROW_TARGET = 7

export type SpeciesId = 'sunflower' | 'tulip' | 'daisy' | 'bluebell'

export interface Species {
  id: SpeciesId
  name: string
  petal: string
  center: string
  leaf: string
  pot: string
}

export const SPECIES: Record<SpeciesId, Species> = {
  sunflower: { id: 'sunflower', name: 'Sunflower', petal: '#F2AE2E', center: '#7A5236', leaf: '#5E9A3C', pot: '#C9744A' },
  tulip: { id: 'tulip', name: 'Tulip', petal: '#E8628A', center: '#C2416A', leaf: '#4F9B5B', pot: '#5C8FB8' },
  daisy: { id: 'daisy', name: 'Daisy', petal: '#FFFFFF', center: '#F2C230', leaf: '#6AA84F', pot: '#B98A5E' },
  bluebell: { id: 'bluebell', name: 'Bluebell', petal: '#6C7FE0', center: '#4A5BC4', leaf: '#4E9670', pot: '#D9A441' },
}

/** Plants are planted in this order, then the cycle repeats. */
export const SPECIES_ORDER: SpeciesId[] = ['sunflower', 'tulip', 'daisy', 'bluebell']

/** Below this share of growth the plant is still a seed in the soil. */
export const SPROUT_AT = 0.08
/** From here the plant shows a bud; at 1 it blooms. */
export const BUD_AT = 0.8

// One full day (1/7 ≈ 0.14) is enough to sprout.
export const STAGES = [
  { at: 0, label: 'Seed' },
  { at: SPROUT_AT, label: 'Sprout' },
  { at: 0.3, label: 'Seedling' },
  { at: 0.55, label: 'Young plant' },
  { at: BUD_AT, label: 'Budding' },
] as const

export type Mood = 'thriving' | 'happy' | 'thirsty' | 'wilting'

export interface GrownPlant {
  species: SpeciesId
  bloomedOn: string
  days: number
}

export interface Garden {
  /** The plant currently growing. */
  current: {
    species: SpeciesId
    number: number
    growth: number
    /** 0–1 share of GROW_TARGET. */
    fraction: number
    stage: string
    nextStage: string | null
    plantedOn: string
  }
  grown: GrownPlant[]
  mood: Mood
  /** 0 = upright and green, 1 = fully drooped and dry. */
  droop: number
  /** Good days still needed to bloom, assuming full days from now on. */
  daysToBloom: number
}

const speciesFor = (n: number) => SPECIES_ORDER[(n - 1) % SPECIES_ORDER.length]

export function stageFor(fraction: number) {
  let i = 0
  for (let s = 0; s < STAGES.length; s++) if (fraction >= STAGES[s].at) i = s
  return { label: STAGES[i].label, next: STAGES[i + 1]?.label ?? 'Bloom' }
}

export function moodFor(progress: number, missedYesterday: boolean): Mood {
  if (progress >= 1) return 'thriving'
  if (progress >= 0.5) return 'happy'
  if (progress > 0 || !missedYesterday) return 'thirsty'
  return 'wilting'
}

/**
 * Walks every day from the first log to today. Each day adds
 * min(total / goal, 1) growth; a plant blooms at GROW_TARGET and the
 * leftover carries into the next seed.
 */
export function computeGarden(totals: Record<string, number>, goal: number, today = new Date()): Garden {
  const todayStart = startOfDay(today)
  const todayKey = dayKey(todayStart)
  const keys = Object.keys(totals).filter((k) => totals[k] > 0 && k <= todayKey).sort()
  const first = keys.length ? parseDayKey(keys[0]) : todayStart

  const grown: GrownPlant[] = []
  let number = 1
  let growth = 0
  let plantedOn = dayKey(first)
  let daysOnPlant = 0

  for (let d = first; d <= todayStart; d = addDays(d, 1)) {
    const k = dayKey(d)
    const credit = goal > 0 ? Math.min((totals[k] ?? 0) / goal, 1) : 0
    growth += credit
    daysOnPlant++
    if (growth >= GROW_TARGET) {
      grown.push({ species: speciesFor(number), bloomedOn: k, days: daysOnPlant })
      growth -= GROW_TARGET
      number++
      daysOnPlant = 0
      plantedOn = dayKey(addDays(d, 1))
    }
  }

  const progress = goal > 0 ? (totals[todayKey] ?? 0) / goal : 0
  const yesterday = dayKey(addDays(todayStart, -1))
  const missedYesterday = keys.length > 0 && keys[0] <= yesterday && (totals[yesterday] ?? 0) < goal * 0.5
  const mood = moodFor(progress, missedYesterday)
  const droop = Math.min(1, Math.max(0, (1 - Math.min(progress, 1)) * 0.75 + (missedYesterday ? 0.25 : 0)))

  const fraction = Math.min(growth / GROW_TARGET, 1)
  const { label, next } = stageFor(fraction)
  // Today's remaining share still counts toward bloom, so subtract it.
  const todayLeft = Math.max(0, 1 - Math.min(progress, 1))
  const daysToBloom = Math.max(1, Math.ceil(GROW_TARGET - growth - todayLeft - 1e-9))

  return {
    current: { species: speciesFor(number), number, growth, fraction, stage: label, nextStage: next, plantedOn },
    grown: grown.reverse(),
    mood,
    droop: progress >= 1 ? 0 : droop,
    daysToBloom,
  }
}

const LINES: Record<Mood, string[]> = {
  thriving: ['I feel amazing. Thanks for looking after us both!', 'Fully watered and soaking up the sun.', 'Look at me grow!'],
  happy: ['Halfway there. A little more and I’ll be perfect.', 'That hit the spot. Keep it coming?', 'Feeling fresh. Another glass soon?'],
  thirsty: ['I’m a bit thirsty. Share a glass with me?', 'My soil’s getting dry…', 'A drink for you is a drink for me.'],
  wilting: ['I’m wilting… please water me!', 'It’s been dry for a while. One glass would help a lot.', 'Help! My leaves are drooping.'],
}

/** What the plant "says", stable for the day so it doesn't flicker. */
export function plantLine(mood: Mood, today = new Date()) {
  const list = LINES[mood]
  return list[(today.getDate() + mood.length) % list.length]
}

export const MOOD_LABEL: Record<Mood, string> = {
  thriving: 'Thriving',
  happy: 'Happy',
  thirsty: 'Thirsty',
  wilting: 'Wilting',
}
