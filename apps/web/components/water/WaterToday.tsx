'use client'

import { WaterTracker } from '@omniwell/tracker-water'
import { useProfile } from '@/lib/useProfile'

/** Water › Today: the glass, streak, drink logger and today's log. */
export function WaterToday() {
  const { profile, error } = useProfile()
  if (error) return <p role="alert" className="notice-error">{error}</p>
  return <WaterTracker profile={profile} />
}
