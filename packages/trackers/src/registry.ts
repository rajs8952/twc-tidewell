import { Calculator, Droplets, Dumbbell, Moon, Scale, Smile, Wind, type LucideIcon } from 'lucide-react'

/* ------------------------------------------------------------------
 * Tracker registry: the one place a wellness module is declared.
 * Hosts list trackers in this order and add their own routes on top.
 * A module stays 'soon' (a placeholder) until its UI ships.
 * ------------------------------------------------------------------ */

export type TrackerId = 'water' | 'mood' | 'meditation' | 'weight' | 'sleep' | 'exercise'

export interface TrackerModule {
  id: TrackerId
  name: string
  description: string
  icon: LucideIcon
  /** Accent colour for the card's icon tile. */
  accent: string
  status: 'live' | 'soon'
}

export const TRACKERS: TrackerModule[] = [
  {
    id: 'water',
    name: 'Water',
    description: 'Daily hydration toward your personal goal.',
    icon: Droplets,
    accent: '#2189D6',
    status: 'live',
  },
  {
    id: 'mood',
    name: 'Mood',
    description: 'Check in on how you feel, your energy and your stress.',
    icon: Smile,
    accent: '#E8628A',
    status: 'live',
  },
  {
    id: 'meditation',
    name: 'Meditation',
    description: 'Log mindful minutes and how calm you feel afterwards.',
    icon: Wind,
    accent: '#7C6BD6',
    status: 'live',
  },
  {
    id: 'sleep',
    name: 'Sleep',
    description: 'Bedtime, wake time and how well you slept.',
    icon: Moon,
    accent: '#4A5BC4',
    status: 'live',
  },
  {
    id: 'weight',
    name: 'Weight',
    description: 'Track your weight trend over weeks, not days.',
    icon: Scale,
    accent: '#2E9C8F',
    status: 'live',
  },
  {
    id: 'exercise',
    name: 'Exercise',
    description: 'Workouts, duration and intensity in one place.',
    icon: Dumbbell,
    accent: '#E9851F',
    status: 'live',
  },
]

/**
 * Tools listed in the Trackers menu after the six trackers. Not trackers:
 * they log nothing, so they're left out of the Hub cards and "done" count.
 */
export const BMI_TOOL = {
  name: 'BMI calculator',
  description: 'Enter your height and weight to see your body-mass index.',
  icon: Calculator,
  accent: '#237A70',
} as const
