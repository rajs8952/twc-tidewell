/* ------------------------------------------------------------------
 * Where trackers read and write their data.
 * Trackers depend only on these interfaces; the host app supplies an
 * implementation through <TrackerStorageProvider>. OmniWell's own uses
 * server actions and Supabase (apps/web/components/OmniWellStorage.tsx); another
 * host could pass a REST, local-storage or in-memory one.
 * ------------------------------------------------------------------ */

import type { ExerciseInput, ExerciseLog } from './exercise'
import type { BeverageId } from './hydration'
import type { MeditationInput, MeditationLog } from './meditation'
import type { MoodInput, MoodLog } from './mood'
import type { SleepInput, SleepLog } from './sleep'
import type { ActionResult, DateRange, DrinkLog, Profile } from './types'
import type { WeightInput, WeightLog } from './weight'

/** A tracker's log entries. Errors come back as results, never thrown. */
export interface LogStore<TLog, TInput, TSaved = TLog> {
  /** Entries in [from, to), newest first. */
  list(range: DateRange): Promise<ActionResult<TLog[]>>
  create(input: TInput): Promise<ActionResult<TSaved>>
  remove(id: string): Promise<ActionResult<null>>
}

/** Drinks. Unlike LogStore these throw on failure, matching lib/data.ts. */
export interface WaterStore {
  list(from: Date, to: Date): Promise<DrinkLog[]>
  add(beverage: BeverageId, amountMl: number): Promise<DrinkLog>
  remove(id: string): Promise<void>
  /** 'YYYY-MM-DD' → effective ml, in the viewer's timezone. */
  dailyTotals(days?: number): Promise<Record<string, number>>
}

/** The signed-in user's profile. Throws on failure. */
export interface ProfileStore {
  get(): Promise<Profile>
  update(id: string, patch: Partial<Omit<Profile, 'id'>>): Promise<Profile>
}

export interface TrackerStorage {
  mood: LogStore<MoodLog, MoodInput>
  sleep: LogStore<SleepLog, SleepInput>
  /** Saving can also copy the weight onto the profile (input.sync_profile). */
  weight: LogStore<WeightLog, WeightInput, { log: WeightLog; profileSynced: boolean }>
  exercise: LogStore<ExerciseLog, ExerciseInput>
  meditation: LogStore<MeditationLog, MeditationInput>
  water: WaterStore
  profile: ProfileStore
}
