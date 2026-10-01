'use client'

import { Loader2, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AvatarPicker } from '@/components/AvatarPicker'
import { ActivityPicker, GenderPicker, GoalPreview, WeightInput } from '@/components/ProfileFields'
import { uploadAvatar } from '@/lib/avatar'
import { getProfile, updateProfile } from '@/lib/data'
import { errorMessage } from '@/lib/errors'
import { calculateDailyGoal } from '@/lib/hydration'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState<Profile | null>(null)
  const [avatar, setAvatar] = useState<{ blob: Blob; url: string } | null>(null)
  const [customOn, setCustomOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    getProfile(supabase)
      .then((p) => {
        setProfile(p)
        setForm(p)
        setCustomOn(p.custom_goal_ml != null)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [supabase])

  if (!form || !profile) {
    return error ? <p role="alert" className="notice-error">{error}</p> : <div className="h-96 animate-pulse rounded-3xl bg-white/70" aria-busy="true" />
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
    const custom = customOn ? form.custom_goal_ml : null
    if (customOn && !(custom && custom >= 500 && custom <= 8000)) return setError('Set a custom goal between 500 and 8,000 ml.')

    setSaving(true)
    try {
      let avatarUrl = form.avatar_url
      if (avatar) avatarUrl = await uploadAvatar(supabase, form.id, avatar.blob)
      const next = await updateProfile(supabase, form.id, {
        full_name: form.full_name.trim(),
        weight_kg: form.weight_kg,
        gender: form.gender,
        activity_level: form.activity_level,
        custom_goal_ml: custom,
        avatar_url: avatarUrl,
      })
      setProfile(next)
      setForm(next)
      setAvatar(null)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <>
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Edit profile</h1>
          <p className="mt-1 text-muted">Your goal updates as soon as you save.</p>
        </div>
        <button type="button" onClick={signOut} className="btn-secondary">
          <LogOut className="h-4 w-4" aria-hidden /> Log out
        </button>
      </header>

      <form onSubmit={onSave} className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <AvatarPicker
            src={avatar?.url ?? form.avatar_url}
            name={form.full_name}
            onPick={(blob, url) => {
              setSaved(false)
              setAvatar({ blob, url })
            }}
          />
          <div>
            <label htmlFor="name" className="label">Name</label>
            <input id="name" required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className="input" />
          </div>
          <WeightInput kg={form.weight_kg} onChange={(kg) => set('weight_kg', kg)} />
          <GenderPicker value={form.gender} onChange={(g) => set('gender', g)} />
          <ActivityPicker value={form.activity_level} onChange={(a) => set('activity_level', a)} />
        </div>

        <aside className="space-y-4 lg:sticky lg:top-10 lg:self-start">
          <GoalPreview weightKg={form.weight_kg} gender={form.gender} activity={form.activity_level} />

          <div className="rounded-3xl bg-white p-5 ring-1 ring-line">
            <label className="flex cursor-pointer items-center justify-between gap-4">
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
          </div>

          {error && <p role="alert" className="notice-error">{error}</p>}
          {saved && <p role="status" className="notice-ok">Profile saved.</p>}

          <button type="submit" disabled={saving} className="btn-primary w-full py-3.5 text-base">
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save changes
          </button>
        </aside>
      </form>
    </>
  )
}
