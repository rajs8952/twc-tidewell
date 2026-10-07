/* ------------------------------------------------------------------
 * In-memory TrackerStorage for demos, tests and offline use. It
 * validates input with the same rules as the server and fills in what
 * the database would (ids, logged_at, sleep duration, effective ml), so
 * trackers behave exactly as they do against the real backend.
 * ------------------------------------------------------------------ */

import { dayKey, startOfDay, addDays } from '@rajs8952/core/dates'
import { validateExerciseInput, type ExerciseInput, type ExerciseLog } from '@rajs8952/core/exercise'
import { BEVERAGES, type BeverageId } from '@rajs8952/core/hydration'
import { validateMeditationInput, type MeditationInput, type MeditationLog } from '@rajs8952/core/meditation'
import { validateMoodInput, type MoodInput, type MoodLog } from '@rajs8952/core/mood'
import { validateSleepInput, type SleepInput, type SleepLog } from '@rajs8952/core/sleep'
import type { LogStore, TrackerStorage } from '@rajs8952/core/storage'
import type { ActionResult, DateRange, DrinkLog, Profile } from '@rajs8952/core/types'
import { validateWeightInput, type WeightInput, type WeightLog } from '@rajs8952/core/weight'

/** Everything a MemoryStorage holds; also the shape LocalStorage persists. */
export interface StorageSnapshot {
  mood: MoodLog[]
  sleep: SleepLog[]
  weight: WeightLog[]
  exercise: ExerciseLog[]
  meditation: MeditationLog[]
  water: DrinkLog[]
  profile: Profile
}

/** A neutral starting profile: 70 kg, moderately active, no height yet. */
export const DEFAULT_PROFILE: Profile = {
  id: 'local',
  full_name: '',
  avatar_url: null,
  weight_kg: 70,
  gender: 'unspecified',
  activity_level: 'moderate',
  custom_goal_ml: null,
  height_cm: null,
  birth_year: null,
}

export interface MemoryStorageOptions {
  /** Starting data; anything left out starts empty (or DEFAULT_PROFILE). */
  initial?: Partial<StorageSnapshot>
  /** Called with all the data after every change, e.g. to persist it. */
  onChange?: (snapshot: StorageSnapshot) => void
  /** Clock and id source, for tests. */
  now?: () => Date
  id?: () => string
}

export type MemoryStorage = TrackerStorage & {
  /** A copy of all the data. */
  snapshot(): StorageSnapshot
}

type Validated<V> = { ok: true; value: V } | { ok: false; error: string }

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const isIso = (s: unknown): s is string => typeof s === 'string' && !Number.isNaN(Date.parse(s))

function defaultId() {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function createMemoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const now = options.now ?? (() => new Date())
  const newId = options.id ?? defaultId
  const data: StorageSnapshot = copy({
    mood: [],
    sleep: [],
    weight: [],
    exercise: [],
    meditation: [],
    water: [],
    ...options.initial,
    profile: { ...DEFAULT_PROFILE, ...options.initial?.profile },
  })
  const changed = () => options.onChange?.(copy(data))

  function logStore<K extends 'mood' | 'sleep' | 'weight' | 'exercise' | 'meditation', TInput, V, TSaved>(
    key: K,
    timeOf: (log: StorageSnapshot[K][number]) => string,
    validate: (input: unknown) => Validated<V>,
    build: (value: V, base: { id: string; logged_at: string }) => StorageSnapshot[K][number],
    saved: (log: StorageSnapshot[K][number], value: V) => TSaved,
  ): LogStore<StorageSnapshot[K][number], TInput, TSaved> {
    type Log = StorageSnapshot[K][number]
    const rows = () => data[key] as Log[]
    return {
      async list(range: DateRange): Promise<ActionResult<Log[]>> {
        if (!isIso(range?.from) || !isIso(range?.to)) return { ok: false, error: 'Invalid date range.' }
        const from = Date.parse(range.from)
        const to = Date.parse(range.to)
        const inRange = rows().filter((l) => {
          const t = Date.parse(timeOf(l))
          return t >= from && t < to
        })
        inRange.sort((a, b) => Date.parse(timeOf(b)) - Date.parse(timeOf(a)))
        return { ok: true, data: copy(inRange) }
      },
      async create(input: TInput): Promise<ActionResult<TSaved>> {
        const parsed = validate(input)
        if (!parsed.ok) return parsed
        const log = build(parsed.value, { id: newId(), logged_at: now().toISOString() })
        rows().push(log)
        const result = saved(log, parsed.value)
        changed()
        return { ok: true, data: copy(result) }
      },
      async remove(id: string): Promise<ActionResult<null>> {
        const i = rows().findIndex((l) => l.id === id)
        if (i >= 0) {
          rows().splice(i, 1)
          changed()
        }
        return { ok: true, data: null }
      },
    }
  }

  const same = <L>(log: L) => log

  return {
    mood: logStore<'mood', MoodInput, MoodInput, MoodLog>(
      'mood',
      (l) => l.logged_at,
      validateMoodInput,
      (v, base) => ({ ...base, mood_state: v.mood_state, energy_level: v.energy_level ?? null, stress_level: v.stress_level ?? null, emotions: v.emotions ?? [], note: v.note ?? null }),
      same,
    ),
    sleep: logStore<'sleep', SleepInput, SleepInput, SleepLog>(
      'sleep',
      (l) => l.wake_at,
      validateSleepInput,
      (v, base) => ({
        ...base,
        bed_at: v.bed_at,
        wake_at: v.wake_at,
        // Generated by the database from the two times.
        duration_min: Math.round((Date.parse(v.wake_at) - Date.parse(v.bed_at)) / 60_000),
        quality: v.quality,
        awakenings: v.awakenings ?? null,
        note: v.note ?? null,
      }),
      same,
    ),
    weight: logStore<'weight', WeightInput, WeightInput, { log: WeightLog; profileSynced: boolean }>(
      'weight',
      (l) => l.logged_at,
      validateWeightInput,
      (v, base) => ({ ...base, weight_kg: v.weight_kg, body_fat_pct: v.body_fat_pct ?? null, note: v.note ?? null }),
      (log, v) => {
        if (v.sync_profile) data.profile.weight_kg = v.weight_kg
        return { log, profileSynced: v.sync_profile === true }
      },
    ),
    exercise: logStore<'exercise', ExerciseInput, ExerciseInput, ExerciseLog>(
      'exercise',
      (l) => l.logged_at,
      validateExerciseInput,
      (v, base) => ({
        ...base,
        activity: v.activity,
        duration_min: v.duration_min,
        intensity: v.intensity,
        calories_kcal: v.calories_kcal ?? null,
        distance_km: v.distance_km ?? null,
        note: v.note ?? null,
      }),
      same,
    ),
    meditation: logStore<'meditation', MeditationInput, MeditationInput, MeditationLog>(
      'meditation',
      (l) => l.logged_at,
      validateMeditationInput,
      (v, base) => ({ ...base, duration_min: v.duration_min, session_type: v.session_type, calm_before: v.calm_before ?? null, calm_after: v.calm_after ?? null, note: v.note ?? null }),
      same,
    ),

    water: {
      async list(from: Date, to: Date) {
        const inRange = data.water.filter((l) => {
          const t = Date.parse(l.logged_at)
          return t >= from.getTime() && t < to.getTime()
        })
        return copy(inRange.sort((a, b) => b.logged_at.localeCompare(a.logged_at)))
      },
      async add(beverage: BeverageId, amountMl: number) {
        // The same checks as the drink_logs table.
        if (!(beverage in BEVERAGES)) throw new Error('Unknown drink.')
        const amount = Math.round(amountMl)
        if (!(amount >= 1 && amount <= 5000)) throw new Error('A drink must be between 1 and 5,000 ml.')
        const multiplier = BEVERAGES[beverage].multiplier
        const log: DrinkLog = {
          id: newId(),
          beverage,
          amount_ml: amount,
          multiplier,
          effective_ml: Math.round(amount * multiplier),
          logged_at: now().toISOString(),
        }
        data.water.push(log)
        changed()
        return copy(log)
      },
      async remove(id: string) {
        const i = data.water.findIndex((l) => l.id === id)
        if (i >= 0) {
          data.water.splice(i, 1)
          changed()
        }
      },
      async dailyTotals(days = 400) {
        const since = addDays(startOfDay(now()), -(days - 1)).getTime()
        const out: Record<string, number> = {}
        for (const l of data.water) {
          const d = new Date(l.logged_at)
          if (d.getTime() < since) continue
          out[dayKey(d)] = (out[dayKey(d)] ?? 0) + l.effective_ml
        }
        return out
      },
    },

    profile: {
      async get() {
        return copy(data.profile)
      },
      async update(_id, patch) {
        Object.assign(data.profile, patch)
        changed()
        return copy(data.profile)
      },
    },

    snapshot: () => copy(data),
  }
}
