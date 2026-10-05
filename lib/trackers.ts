import { Droplets, Dumbbell, Moon, Scale, Smile, Wind, type LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------
 * Tracker registry: the one place a wellness module is declared.
 * The Hub, the navigation and the landing page all list trackers in this
 * order. A module stays 'soon' (a placeholder) until its UI ships.
 * ------------------------------------------------------------------ */

export type TrackerId = 'water' | 'mood' | 'meditation' | 'weight' | 'sleep' | 'exercise'

export interface TrackerModule {
  id: TrackerId
  name: string
  description: string
  icon: LucideIcon
  /** Accent colour for the card's icon tile. */
  accent: string
  /** Supabase table holding this tracker's entries (see supabase/*.sql). */
  table: string
  /** The tracker's own page. */
  href: string
  status: 'live' | 'soon'
}

export const TRACKERS: TrackerModule[] = [
  {
    id: 'water',
    name: 'Water',
    description: 'Daily hydration toward your personal goal.',
    icon: Droplets,
    accent: '#2189D6',
    table: 'drink_logs',
    href: '/water',
    status: 'live',
  },
  {
    id: 'mood',
    name: 'Mood',
    description: 'Check in on how you feel, your energy and your stress.',
    icon: Smile,
    accent: '#E8628A',
    table: 'mood_logs',
    href: '/mood',
    status: 'live',
  },
  {
    id: 'meditation',
    name: 'Meditation',
    description: 'Log mindful minutes and how calm you feel afterwards.',
    icon: Wind,
    accent: '#7C6BD6',
    table: 'meditation_logs',
    href: '/meditation',
    status: 'live',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Bedtime, wake time and how well you slept.',
    icon: Moon,
    accent: '#4A5BC4',
    table: 'sleep_logs',
    href: '/sleep',
    status: 'live',
  },
  {
    id: 'weight',
    name: 'Weight',
    description: 'Track your weight trend over weeks, not days.',
    icon: Scale,
    accent: '#2E9C8F',
    table: 'weight_logs',
    href: '/weight',
    status: 'live',
  },
  {
    id: 'exercise',
    name: 'Exercise',
    description: 'Workouts, duration and intensity in one place.',
    icon: Dumbbell,
    accent: '#E9851F',
    table: 'exercise_logs',
    href: '/exercise',
    status: 'live',
  },
]
