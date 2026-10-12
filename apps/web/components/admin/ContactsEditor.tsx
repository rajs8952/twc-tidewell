'use client'

import { AlertTriangle, LifeBuoy, Loader2, Save } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { saveWellnessContacts } from '@/app/actions/contacts'
import { errorMessage } from '@rajs8952/core/errors'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { publishContacts } from '@/lib/useWellnessContacts'
import { CONTACT_COLUMNS, WELLNESS_TEAM, type ContactId, type ContactRow } from '@/lib/wellness-team'

/* ------------------------------------------------------------------
 * Admin portal → Wellness contacts: the EAP, therapist and dietitian
 * details and the emergency number that employees see on Home, in chats
 * and in the crisis prompt (supabase/wellness-contacts.sql).
 * ------------------------------------------------------------------ */

type Form = Record<ContactId, ContactRow>

const blank = (id: ContactId): ContactRow => ({ id, name: '', description: '', phone: null, email: null, url: null, hours: null })

function Field({
  id,
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
  multiline,
}: {
  id: string
  label: string
  value: string | null
  onChange: (v: string) => void
  hint?: string
  type?: string
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={2} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input min-h-[64px] resize-y" aria-describedby={hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input" aria-describedby={hint ? `${id}-hint` : undefined} />
      )}
      {hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  )
}

export function ContactsEditor() {
  const supabase = useMemo(() => createClient(), [])
  const [form, setForm] = useState<Form | null>(null)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    trackProgress(Promise.resolve(supabase.from('wellness_contacts').select(CONTACT_COLUMNS))).then(({ data, error: e }) => {
      if (e) {
        if (e.code === 'PGRST205' || e.code === '42P01') setMissing(true)
        else setError(e.message)
        return
      }
      const rows = (data ?? []) as ContactRow[]
      const f = Object.fromEntries((['eap', 'therapist', 'dietitian', 'emergency'] as ContactId[]).map((id) => [id, rows.find((r) => r.id === id) ?? blank(id)])) as Form
      setForm(f)
    })
  }, [supabase])

  const set = (id: ContactId, key: keyof ContactRow) => (v: string) => {
    setSaved(null)
    setForm((f) => (f ? { ...f, [id]: { ...f[id], [key]: v } } : f))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setError(null)
    setSaved(null)
    try {
      const res = await saveWellnessContacts(Object.values(form))
      if (!res.ok) return setError(res.error)
      publishContacts(res.data)
      setForm(Object.fromEntries(res.data.map((r) => [r.id, r])) as Form)
      setSaved('Saved. Employees see the new details the next time they open OmniWell.')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const samePhone = !!form && !!form.eap.phone && form.eap.phone.replace(/\D/g, '') === (form.therapist.phone ?? '').replace(/\D/g, '')

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Wellness contacts</h1>
        <p className="mt-1 text-muted">
          The details employees see on Home (“Your wellness team”), in chats and in the crisis prompt. Leave a detail empty to show “Details coming soon”; nothing
          made up ever reaches employees.
        </p>
      </div>

      {missing && <p className="notice-error mb-6">Wellness contacts aren’t set up yet. Run supabase/wellness-contacts.sql in Supabase first.</p>}

      {!form && !missing && !error && (
        <div className="grid gap-4 md:grid-cols-3" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-96 animate-pulse rounded-3xl bg-white ring-1 ring-line" />
          ))}
        </div>
      )}

      {form && (
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            {WELLNESS_TEAM.map((c) => {
              const row = form[c.id]
              const Icon = c.icon
              return (
                <fieldset key={c.id} className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-line">
                  <legend className="sr-only">{c.name}</legend>
                  <p className="flex items-center gap-2 font-bold" aria-hidden>
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl text-white" style={{ background: c.accent }}>
                      <Icon className="h-5 w-5" />
                    </span>
                    {c.id === 'eap' ? 'EAP' : c.id === 'therapist' ? 'Therapist' : 'Dietitian'}
                  </p>
                  <Field id={`${c.id}-name`} label="Name" value={row.name} onChange={set(c.id, 'name')} />
                  <Field id={`${c.id}-description`} label="What they help with" value={row.description} onChange={set(c.id, 'description')} multiline />
                  <Field
                    id={`${c.id}-phone`}
                    label="Phone"
                    type="tel"
                    value={row.phone}
                    onChange={set(c.id, 'phone')}
                    placeholder="+91 80 1234 5678"
                    hint={c.id === 'eap' ? 'Shown large in the crisis prompt and on the offline page.' : undefined}
                  />
                  <Field id={`${c.id}-email`} label="Email" type="email" value={row.email} onChange={set(c.id, 'email')} placeholder="name@company.com" />
                  <Field id={`${c.id}-url`} label="Booking or info link" type="url" value={row.url} onChange={set(c.id, 'url')} placeholder="https://" hint="Optional. Must start with https://" />
                  <Field id={`${c.id}-hours`} label="Hours" value={row.hours} onChange={set(c.id, 'hours')} placeholder="Mon–Fri, 9 am – 6 pm" hint="Optional." />
                </fieldset>
              )
            })}
          </div>

          {samePhone && (
            <p role="status" className="flex items-start gap-2 rounded-2xl bg-[#FDF3E6] px-4 py-3 text-sm text-ink ring-1 ring-[#F2D3A8]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B9650E]" aria-hidden />
              The EAP and the therapist have the same phone number. That’s fine if one line serves both; otherwise add the therapist’s own number.
            </p>
          )}

          <fieldset className="max-w-md space-y-4 rounded-3xl bg-white p-5 ring-1 ring-line">
            <legend className="sr-only">Emergency number</legend>
            <p className="flex items-center gap-2 font-bold" aria-hidden>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#B8402B] text-white">
                <LifeBuoy className="h-5 w-5" />
              </span>
              Emergency number
            </p>
            <Field
              id="emergency-phone"
              label="Local emergency number"
              type="tel"
              value={form.emergency.phone}
              onChange={set('emergency', 'phone')}
              placeholder="112"
              hint="Shown in the crisis prompt and under “Your wellness team”: “In immediate danger? Call 112 now.”"
            />
          </fieldset>

          {error && (
            <p role="alert" className="notice-error">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="notice-ok">
              {saved}
            </p>
          )}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save contacts
          </button>
        </form>
      )}

      {error && !form && (
        <p role="alert" className="notice-error">
          {error}
        </p>
      )}
    </>
  )
}
