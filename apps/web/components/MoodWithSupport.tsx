'use client'

import { useState } from 'react'
import { InterventionBanner } from '@/components/interventions/InterventionBanner'
import { MoodTracker } from '@rajs8952/tracker-mood'
import { evaluateMetric, moodInterventionKey, type Intervention } from '@rajs8952/interventions'
import { useDismissed } from '@/lib/useDismissed'

/** The Mood tracker plus OmniWell's crisis prompt, which opens as soon as a check-in calls for it. */
export function MoodWithSupport() {
  const [crisis, setCrisis] = useState<Intervention | null>(null)
  const { dismiss } = useDismissed()
  return (
    <MoodTracker
      onCheckIn={(input) => {
        const check = evaluateMetric({ type: 'mood', value: input.mood_state })
        if (check.severity === 'CRITICAL') setCrisis(check)
      }}
      banner={
        <InterventionBanner
          intervention={crisis}
          onDismiss={() => {
            // Also counts for the Hub, so the same dialog doesn't greet them there today.
            if (crisis) dismiss(moodInterventionKey(crisis))
            setCrisis(null)
          }}
        />
      }
    />
  )
}
