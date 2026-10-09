'use client'

import { Droplets, KeyRound, Loader2, Ruler, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AvatarPicker } from '@/components/AvatarPicker'
import { InstallCard } from '@/components/pwa/InstallCard'
import { AdminCard } from '@/components/admin/AdminCard'
import { CoachPortalCard } from '@/components/therapist/CoachPortalCard'
import { NotificationSettings } from '@/components/notifications/NotificationSettings'
import { ActivityPicker, GenderPicker, GoalPreview, HeightInput, WeightInput } from '@rajs8952/ui'
import { BmiReadout } from '@rajs8952/tracker-bmi'
import { LogoutButton } from '@/components/profile/LogoutButton'
import { ProfileSection } from '@/components/profile/ProfileSection'
import { uploadAvatar } from '@/lib/avatar'
import { AGE, HEIGHT_CM, ageFromBirthYear, birthYearFromAge } from '@rajs8952/core/biometrics'
import { PILLAR_COLORS } from '@/lib/brand'
import { getProfile } from '@/lib/data'
import { updateProfileRow } from '@rajs8952/storage/supabase'
import { errorMessage } from '@rajs8952/core/errors'
import { calculateDailyGoal } from '@rajs8952/core/hydration'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@rajs8952/core/types'
import { trackProgress } from '@/lib/progress'

/*
 * Profile: Account (photo, name, email, logout), Biometrics (height, weight,
 * age, sex, activity → BMI and the water goal), saved together. The wellness
 * team's contacts live on the Home screen (components/hub/WellnessTeam.tsx).
 */

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<Profile | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [ageText, setAgeText] = useState('')
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null)
  const [customOn, setCustomOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    trackProgress(getProfile(supabase))
      .then((p) => {
        setForm(p)
        setCustomOn(p.custom_goal_ml != null)
        const age = ageFromBirthYear(p.birth_year)
        setAgeText(age == null ? '' : String(age))
      })
      .catch((e) => setError(errorMessage(e)))
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [supabase])

  if (!form) {
    return error ? (
      <p role="alert" className="notice-error">{error}</p>
    ) : (
      <div className="space-y-6" aria-busy="true" aria-label="Loading your profile">
        <div className="h-12 w-48 animate-pulse rounded-2xl bg-white/70" />
        <div className="h-72 animate-pulse rounded-3xl bg-white/70" />
        <div className="h-96 animate-pulse rounded-3xl bg-white/70" />
      </div>
    )
  }

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => {
    setSaved(false)
    setForm((f) => (f ? { ...f, [k]: v } : f))
  }

  const smartGoal = calculateDailyGoal({ weightKg: form.weight_kg, gender: form.gender, activity: form.activity_level })

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)
    setSaved(false)
    if (!form.full_name.trim()) return setError('Add your name.')
    if (!(form.weight_kg >= 25 && form.weight_kg <= 300)) return setError('Enter a weight between 25 and 300 kg.')
    if (form.height_cm != null && !(form.height_cm >= HEIGHT_CM.min && form.height_cm <= HEIGHT_CM.max)) {
      return setError(`Enter a height between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm (about 3′3″ to 8′2″).`)
    }
    const age = ageText.trim() === '' ? null : Number(ageText)
    if (age != null && !(Number.isInteger(age) && age >= AGE.min && age <= AGE.max)) {
      return setError(`Enter an age between ${AGE.min} and ${AGE.max}, in whole years.`)
    }
    const custom = customOn ? form.custom_goal_ml : null
    if (customOn && !(custom && custom >= 500 && custom <= 8000)) return setError('Set a custom goal between 500 and 8,000 ml.')

    setSaving(true)
    try {
      let avatarUrl = form.avatar_url
      if (avatar) avatarUrl = await uploadAvatar(supabase, form.id, avatar.blob)
      // Keep the stored birth year when the age shown hasn't changed, so saving doesn't nudge it.
      const birthYear = age == null ? null : age === ageFromBirthYear(form.birth_year) ? form.birth_year : birthYearFromAge(age)
      const next = await updateProfileRow(supabase, form.id, {
        full_name: form.full_name.trim(),
        weight_kg: form.weight_kg,
        height_cm: form.height_cm,
        birth_year: birthYear,
        gender: form.gender,
        activity_level: form.activity_level,
        custom_goal_ml: custom,
        avatar_url: avatarUrl,
      })
      setForm(next)
      setAvatar(null)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Profile</h1>
        <p className="mt-1 text-muted">Your account and your body measurements.</p>
      </header>

      <form onSubmit={onSave} className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfileSection id="account" title="Account" icon={UserRound} accent="#0F2F37">
            <AvatarPicker
              src={avatar?.url ?? form.avatar_url}
              name={form.full_name}
              onPick={(blob, url) => {
                setSaved(false)
                setAvatar({ blob, url })
              }}
            />
            <div className="mt-5 space-y-4">
              <div>
                <label htmlFor="name" className="label">Name</label>
                <input id="name" required autoComplete="name" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className="input" />
              </div>
              <div>
                <label htmlFor="email" className="label">Email</label>
                <input id="email" type="email" readOnly value={email ?? ''} placeholder="Loading…" className="input bg-mist/70 text-ink" aria-describedby="email-hint" />
                <p id="email-hint" className="mt-1 text-xs text-muted">The email you log in with. It can’t be changed here.</p>
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">Change the password you log in with.</p>
              <Link href="/update-password" className="btn-secondary">
                <KeyRound className="h-4 w-4" aria-hidden /> Change password
              </Link>
            </div>
            <div className="mt-4 flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted">Log out of OmniWell on this device.</p>
              <LogoutButton />
            </div>
          </ProfileSection>

          <ProfileSection
            id="biometrics"
            title="Biometrics"
            description="Used for your BMI and smart daily targets."
            icon={Ruler}
            accent={PILLAR_COLORS.weight}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <HeightInput cm={form.height_cm} onChange={(cm) => set('height_cm', cm)} />
              <WeightInput kg={form.weight_kg} onChange={(kg) => set('weight_kg', kg)} />
              <div>
                <label htmlFor="age" className="label">Age</label>
                <div className="relative">
                  <input
                    id="age"
                    type="number"
                    inputMode="numeric"
                    min={AGE.min}
                    max={AGE.max}
                    step={1}
                    placeholder="30"
                    value={ageText}
                    onChange={(e) => {
                      setSaved(false)
                      setAgeText(e.target.value)
                    }}
                    className="input pr-16"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">years</span>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <GenderPicker value={form.gender} onChange={(g) => set('gender', g)} />
            </div>
            <div className="mt-4">
              <BmiReadout heightCm={form.height_cm} weightKg={form.weight_kg} />
            </div>
            <div className="mt-5">
              <ActivityPicker value={form.activity_level} onChange={(a) => set('activity_level', a)} />
            </div>
          </ProfileSection>

          <CoachPortalCard />
          <AdminCard />
          <InstallCard />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <ProfileSection id="water-goal" title="Water goal" description="Worked out from your biometrics." icon={Droplets} accent={PILLAR_COLORS.water}>
            <GoalPreview weightKg={form.weight_kg} gender={form.gender} activity={form.activity_level} />
            <label className="mt-4 flex cursor-pointer items-center justify-between gap-4">
              <span>
                <span className="block text-sm font-bold">Set my own goal</span>
                <span className="block text-xs text-muted">Use this if a doctor or coach gave you a target.</span>
              </span>
              <input
                type="checkbox"
                checked={customOn}
                onChange={(e) => {
                  setSaved(false)
                  setCustomOn(e.target.checked)
                  if (e.target.checked && form.custom_goal_ml == null) set('custom_goal_ml', smartGoal)
                }}
                className="h-5 w-5 accent-tide-600"
              />
            </label>
            {customOn && (
              <div className="relative mt-4">
                <label htmlFor="custom-goal" className="sr-only">Custom daily goal in millilitres</label>
                <input
                  id="custom-goal"
                  type="number"
                  inputMode="numeric"
                  min={500}
                  max={8000}
                  step={50}
                  value={form.custom_goal_ml ?? ''}
                  onChange={(e) => set('custom_goal_ml', e.target.value === '' ? null : Number(e.target.value))}
                  className="input pr-12"
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">ml</span>
              </div>
            )}
          </ProfileSection>

          {error && <p role="alert" className="notice-error">{error}</p>}
          {saved && <p role="status" className="notice-ok">Profile saved.</p>}

          <button type="submit" disabled={saving} className="btn-primary w-full py-3.5 text-base">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save changes
          </button>
        </aside>
      </form>

      <div className="mt-6">
        <NotificationSettings />
      </div>

    </>
  )
}
