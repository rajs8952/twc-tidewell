'use client'

import { Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { HeightInput, WeightInput } from '@omniwell/ui'
import { BmiReadout } from './BmiReadout'
import { HEIGHT_CM, healthyWeightRange } from '@omniwell/core/biometrics'
import { useTrackerStorage } from '@omniwell/ui'
import { errorMessage } from '@omniwell/core/errors'
import type { Profile } from '@omniwell/core/types'
import { useStoredProfile } from '@omniwell/ui'

/**
 * BMI calculator: starts from the profile's height and weight, recalculates
 * as you type, and only changes the profile when you choose "Save to profile",
 * so trying other numbers is safe.
 */
export function BmiCalculator() {
  const { profile, setProfile, error } = useStoredProfile()
  if (error) return <p role="alert" className="omni-notice-error">{error}</p>
  if (!profile) return <div className="h-80 animate-pulse rounded-3xl bg-white/70" aria-busy="true" aria-label="Loading your measurements" />
  // Keyed so the inputs start from the saved values once the profile has loaded.
  return <Calculator key={profile.id} profile={profile} onSaved={setProfile} />
}

function Calculator({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const storage = useTrackerStorage()
  const [heightCm, setHeightCm] = useState<number | null>(profile.height_cm)
  const [weightKg, setWeightKg] = useState(profile.weight_kg)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const validHeight = heightCm != null && heightCm >= HEIGHT_CM.min && heightCm <= HEIGHT_CM.max
  const validWeight = weightKg >= 25 && weightKg <= 300
  const changed = heightCm !== profile.height_cm || weightKg !== profile.weight_kg
  const range = validHeight ? healthyWeightRange(heightCm) : null

  async function save() {
    setMessage(null)
    if (!validHeight) return setMessage({ ok: false, text: `Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.` })
    if (!validWeight) return setMessage({ ok: false, text: 'Enter a weight between 25 and 300 kg.' })
    setSaving(true)
    try {
      const next = await storage.profile.update(profile.id, { height_cm: heightCm, weight_kg: weightKg })
      onSaved(next)
      setMessage({ ok: true, text: 'Saved to your profile. Your water goal uses the new weight.' })
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="bmi-inputs" className="rounded-3xl bg-white p-5 ring-1 ring-line sm:p-6">
        <h2 id="bmi-inputs" className="text-lg font-extrabold">Your measurements</h2>
        <p className="mt-0.5 text-sm text-muted">Filled in from your profile. Change them to see how your BMI moves.</p>
        <div className="mt-5 space-y-4">
          <HeightInput
            cm={heightCm}
            onChange={(cm) => {
              setMessage(null)
              setHeightCm(cm)
            }}
          />
          <WeightInput
            kg={weightKg}
            onChange={(kg) => {
              setMessage(null)
              setWeightKg(kg)
            }}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">{changed ? 'These aren’t saved yet.' : 'These match your profile.'}</p>
          <button type="button" onClick={save} disabled={!changed || saving} className="omni-btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save to profile
          </button>
        </div>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`${message.ok ? 'omni-notice-ok' : 'omni-notice-error'} mt-3`}>
            {message.text}
          </p>
        )}
      </section>

      <section aria-label="Your BMI" className="space-y-4 lg:sticky lg:top-10 lg:self-start">
        <BmiReadout heightCm={validHeight ? heightCm : null} weightKg={validWeight ? weightKg : 0} />
        {range && (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <p className="text-sm font-bold">Healthy weight for your height</p>
            <p className="mt-1 font-display text-2xl font-extrabold tabular-nums">
              {range.min.toFixed(1)}–{range.max.toFixed(1)} kg
            </p>
            <p className="mt-1 text-xs text-muted">The weights that give a BMI of 18.5 to 24.9 at {heightCm} cm.</p>
          </div>
        )}
      </section>
    </div>
  )
}
