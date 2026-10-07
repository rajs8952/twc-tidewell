import {
  BMI_TOOL as BMI_TOOL_DEFINITION,
  TRACKERS as REGISTRY,
  type TrackerModule as TrackerDefinition,
} from '@rajs8952/trackers/registry'

export type { TrackerId } from '@rajs8952/trackers/registry'

/* The shared tracker registry plus OmniWell's routes: each tracker lives at /<id>. */

export interface TrackerModule extends TrackerDefinition {
  /** The tracker's own page. */
  href: string
}

export const TRACKERS: TrackerModule[] = REGISTRY.map((t) => ({ ...t, href: `/${t.id}` }))

export const BMI_TOOL = { ...BMI_TOOL_DEFINITION, href: '/bmi' } as const
