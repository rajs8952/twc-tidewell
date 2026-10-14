import { createSupabaseStorage } from '@rajs8952/storage/supabase'
import type { hubSummaries } from '@rajs8952/trackers/hub'
import { Calculator, Droplets, Dumbbell, Moon, Scale, Smile, Wind, type LucideIcon } from 'lucide-react-native'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * The trackers, as on the website (packages/trackers/src/registry.ts),
 * and their storage: the same Supabase queries and validation the
 * website uses (@rajs8952/storage/supabase), run as the signed-in person
 * so row-level security keeps everything to their own entries.
 * ------------------------------------------------------------------ */

export const storage = createSupabaseStorage(supabase)

/** The six trackers (the website's TrackerId; the hub's summaries are keyed by it). */
export type TrackerId = keyof ReturnType<typeof hubSummaries>

export interface TrackerMeta {
  id: TrackerId | 'bmi'
  name: string
  description: string
  icon: LucideIcon
  accent: string
  /** A light tint of the accent, for backgrounds. */
  tint: string
}

export const TRACKERS: Record<TrackerId, TrackerMeta> = {
  water: { id: 'water', name: 'Water', description: 'Daily hydration toward your personal goal.', icon: Droplets, accent: '#2189D6', tint: '#E3F0FB' },
  mood: { id: 'mood', name: 'Mood', description: 'Check in on how you feel, your energy and your stress.', icon: Smile, accent: '#E8628A', tint: '#FCE8EE' },
  meditation: { id: 'meditation', name: 'Meditation', description: 'Log mindful minutes and how calm you feel afterwards.', icon: Wind, accent: '#7C6BD6', tint: '#EFECFA' },
  sleep: { id: 'sleep', name: 'Sleep', description: 'Bedtime, wake time and how well you slept.', icon: Moon, accent: '#4A5BC4', tint: '#E8EAF8' },
  weight: { id: 'weight', name: 'Weight', description: 'Track your weight trend over weeks, not days.', icon: Scale, accent: '#2E9C8F', tint: '#E1F2EF' },
  exercise: { id: 'exercise', name: 'Exercise', description: 'Workouts, duration and intensity in one place.', icon: Dumbbell, accent: '#E9851F', tint: '#FCEDDB' },
}

export const BMI: TrackerMeta = { id: 'bmi', name: 'BMI', description: 'Your body-mass index from your height and weight.', icon: Calculator, accent: '#237A70', tint: '#DFF0ED' }

/** Home's card order (the website's). */
export const TRACKER_ORDER: TrackerId[] = ['water', 'mood', 'meditation', 'sleep', 'weight', 'exercise']

/** An ActionResult's error, or the data. */
export function unwrap<T>(r: { ok: true; data: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error)
  return r.data
}

/** Any thrown value as a message to show. */
export const messageOf = (e: unknown) => {
  const m = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.'
  return /network request failed|failed to fetch/i.test(m) ? 'Couldn’t reach OmniWell. Check your connection and try again.' : m
}
