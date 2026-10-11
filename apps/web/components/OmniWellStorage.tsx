'use client'

import { useMemo } from 'react'
import { deleteExercise, updateExercise, getExerciseLogs, logExercise } from '@/app/actions/exercise'
import { deleteMeditation, updateMeditation, getMeditationLogs, logMeditation } from '@/app/actions/meditation'
import { deleteMood, updateMood, getMoodLogs, logMood } from '@/app/actions/mood'
import { deleteSleep, updateSleep, getSleepLogs, logSleep } from '@/app/actions/sleep'
import { deleteWeight, updateWeight, getWeightLogs, logWeight } from '@/app/actions/weight'
import { TrackerStorageProvider } from '@rajs8952/ui'
import { getProfile } from '@/lib/data'
import { addDrinkLog, deleteDrinkLog, updateDrinkLog, getDailyTotals, getDrinkLogs, updateProfileRow } from '@rajs8952/storage/supabase'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import type { TrackerStorage } from '@rajs8952/core/storage'

/**
 * OmniWell's tracker storage: server actions for the wellness logs,
 * the browser Supabase client for drinks and the profile.
 */
export function createOmniWellStorage(): TrackerStorage {
  const supabase = createClient()
  return {
    mood: { list: (r) => getMoodLogs(r.from, r.to), create: logMood, update: updateMood, remove: deleteMood },
    sleep: { list: (r) => getSleepLogs(r.from, r.to), create: logSleep, update: updateSleep, remove: deleteSleep },
    weight: { list: (r) => getWeightLogs(r.from, r.to), create: logWeight, update: updateWeight, remove: deleteWeight },
    exercise: { list: (r) => getExerciseLogs(r.from, r.to), create: logExercise, update: updateExercise, remove: deleteExercise },
    meditation: { list: (r) => getMeditationLogs(r.from, r.to), create: logMeditation, update: updateMeditation, remove: deleteMeditation },
    water: {
      list: (from, to) => getDrinkLogs(supabase, from, to),
      add: (beverage, ml, at) => addDrinkLog(supabase, beverage, ml, at),
      update: (id, change) => updateDrinkLog(supabase, id, change),
      remove: (id) => deleteDrinkLog(supabase, id),
      dailyTotals: (days) => getDailyTotals(supabase, days),
    },
    profile: {
      get: () => getProfile(supabase),
      update: (id, patch) => updateProfileRow(supabase, id, patch),
    },
  }
}

export function OmniWellStorage({ children }: { children: React.ReactNode }) {
  const storage = useMemo(createOmniWellStorage, [])
  return <TrackerStorageProvider storage={storage} trackLoad={trackProgress}>{children}</TrackerStorageProvider>
}
