'use client'

import { Check, Copy, Eye, EyeOff, Loader2, Wand2 } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { adminCreateUser, adminDeactivateUser, adminReactivateUser, adminReleaseCoachChats, adminSetCoachCapacity, adminSetUserRole, adminUpdateUserPassword } from '@/app/actions/admin'
import { ACTIVITY_LEVELS, GENDERS, type Activity, type Gender } from '@rajs8952/core/hydration'
import { COACH_CAPACITY_MAX, PASSWORD_MAX, PASSWORD_MIN, validateNewUser, validatePassword, type AdminUser, type AppRole } from '@/lib/admin'
import { TEAMS, type Team } from '@/lib/messages'
import { Dialog } from '@/components/Dialog'

/* ------------------------------------------------------------------
 * The admin portal's dialogs. Each checks input with the same rules
 * the server uses (lib/admin.ts), then calls an admin server action
 * (app/actions/admin.ts), which checks the caller is an admin again.
 * ------------------------------------------------------------------ */

export const ROLE_LABEL: Record<AppRole, string> = { user: 'User', coach: 'Coach', admin: 'Admin' }

/** A strong random password from the browser's secure generator; no look-alike characters. */
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?'
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

/** Password input with show/hide, generate and copy. */
function PasswordField({ id, value, onChange, label = 'Password' }: { id: string; value: string; onChange: (v: string) => void; label?: string }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  return (
    <Field label={label} htmlFor={id} hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters. Share it with them securely; they aren’t emailed.`}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={id}
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            value={value}
            onChange={(e) => {
              onChange(e.target.value)
              setCopied(false)
            }}
            className="input pr-11 font-mono"
          />
          <button type="button" onClick={() => setShown((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted hover:text-ink" aria-label={shown ? 'Hide password' : 'Show password'}>
            {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(generatePassword())
            setShown(true)
            setCopied(false)
          }}
          className="btn-secondary shrink-0 px-3"
          title="Generate a strong password"
        >
          <Wand2 className="h-4 w-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Generate</span>
        </button>
        <button
          type="button"
          disabled={!value}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
            } catch {
              setShown(true)
            }
          }}
          className="btn-secondary shrink-0 px-3"
          aria-label={copied ? 'Copied' : 'Copy password'}
          title="Copy"
        >
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </Field>
  )
}

function TeamPicker({ value, onChange }: { value: Team | ''; onChange: (t: Team) => void }) {
  return (
    <fieldset>
      <legend className="label">Coach’s team</legend>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(TEAMS) as Team[]).map((t) => (
          <label key={t} className={`cursor-pointer rounded-2xl border px-3 py-2.5 text-center text-sm font-bold transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide-500 ${value === t ? 'border-ink bg-mist' : 'border-line hover:border-ink/30'}`}>
            <input type="radio" name="coach-team" value={t} checked={value === t} onChange={() => onChange(t)} className="sr-only" />
            {TEAMS[t].label}
          </label>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Coaches see and reply to their team’s conversations only.</p>
    </fieldset>
  )
}

function RolePicker({ value, onChange }: { value: AppRole; onChange: (r: AppRole) => void }) {
  const hint: Record<AppRole, string> = { user: 'Uses the app', coach: 'Answers a team’s chats', admin: 'Manages users' }
  return (
    <fieldset>
      <legend className="label">Role</legend>
      <div className="grid grid-cols-3 gap-2">
        {(['user', 'coach', 'admin'] as AppRole[]).map((r) => (
          <label key={r} className={`cursor-pointer rounded-2xl border px-2 py-2.5 text-center transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-tide-500 ${value === r ? 'border-ink bg-mist' : 'border-line hover:border-ink/30'}`}>
            <input type="radio" name="role" value={r} checked={value === r} onChange={() => onChange(r)} className="sr-only" />
            <span className="block text-sm font-bold">{ROLE_LABEL[r]}</span>
            <span className="block text-[11px] text-muted">{hint[r]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ErrorNote({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="notice-error mt-4">
      {error}
    </p>
  ) : null
}

const num = (v: string) => (v.trim() === '' ? undefined : Number(v))

/* ---------- Add user ---------- */

export function AddUserDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const ids = { name: useId(), email: useId(), password: useId(), weight: useId(), height: useId(), age: useId(), gender: useId(), activity: useId() }
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'user' as AppRole, team: '' as Team | '', weight: '', height: '', age: '', gender: '' as Gender | '', activity: '' as Activity | '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setError(null)
    setForm((f) => ({ ...f, [k]: v }))
  }

  function reset() {
    setForm({ full_name: '', email: '', password: '', role: 'user', team: '', weight: '', height: '', age: '', gender: '', activity: '' })
    setError(null)
  }

  async function submit() {
    const profile = {
      full_name: form.full_name,
      weight_kg: num(form.weight),
      height_cm: num(form.height) ?? null,
      age: num(form.age) ?? null,
      gender: form.gender || undefined,
      activity_level: form.activity || undefined,
      coach_team: form.team || undefined,
    }
    const check = validateNewUser({ email: form.email, password: form.password, role: form.role, profile })
    if (!check.ok) return setError(check.error)
    setBusy(true)
    try {
      const res = await adminCreateUser(form.email, form.password, form.role, profile)
      if (!res.ok) return setError(res.error)
      onCreated(res.data)
      reset()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      busy={busy}
      onClose={() => {
        reset()
        onClose()
      }}
      title="Add a user"
      description="The account is ready to use straight away; no confirmation email is sent."
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Create user
          </button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Name" htmlFor={ids.name}>
          <input id={ids.name} autoComplete="off" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className="input" />
        </Field>
        <Field label="Email" htmlFor={ids.email}>
          <input id={ids.email} type="email" autoComplete="off" value={form.email} onChange={(e) => set('email', e.target.value)} className="input" />
        </Field>
        <PasswordField id={ids.password} value={form.password} onChange={(v) => set('password', v)} />
        <RolePicker value={form.role} onChange={(r) => set('role', r)} />
        {form.role === 'coach' && <TeamPicker value={form.team} onChange={(t) => set('team', t)} />}

        <details className="rounded-2xl bg-mist/60 px-4 py-3 ring-1 ring-line">
          <summary className="cursor-pointer text-sm font-bold">Profile details (optional)</summary>
          <p className="mt-1 text-xs text-muted">They can change these themselves in Profile.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Weight (kg)" htmlFor={ids.weight}>
              <input id={ids.weight} type="number" inputMode="decimal" min={25} max={300} step={0.1} value={form.weight} onChange={(e) => set('weight', e.target.value)} className="input" />
            </Field>
            <Field label="Height (cm)" htmlFor={ids.height}>
              <input id={ids.height} type="number" inputMode="decimal" min={100} max={250} step={0.5} value={form.height} onChange={(e) => set('height', e.target.value)} className="input" />
            </Field>
            <Field label="Age" htmlFor={ids.age}>
              <input id={ids.age} type="number" inputMode="numeric" min={13} max={120} step={1} value={form.age} onChange={(e) => set('age', e.target.value)} className="input" />
            </Field>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Sex" htmlFor={ids.gender}>
              <select id={ids.gender} value={form.gender} onChange={(e) => set('gender', e.target.value as Gender | '')} className="input">
                <option value="">Not set</option>
                {GENDERS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Daily activity" htmlFor={ids.activity}>
              <select id={ids.activity} value={form.activity} onChange={(e) => set('activity', e.target.value as Activity | '')} className="input">
                <option value="">Not set</option>
                {ACTIVITY_LEVELS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </details>
        {/* Lets Enter submit the form. */}
        <button type="submit" hidden />
      </form>
      <ErrorNote error={error} />
    </Dialog>
  )
}

/* ---------- Reset password ---------- */

export function ResetPasswordDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (msg: string) => void }) {
  const id = useId()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setPassword('')
    setError(null)
    onClose()
  }

  async function submit() {
    if (!user) return
    const check = validatePassword(password)
    if (!check.ok) return setError(check.error)
    setBusy(true)
    try {
      const res = await adminUpdateUserPassword(user.id, password)
      if (!res.ok) return setError(res.error)
      onDone(`Password changed for ${user.full_name || user.email}. Share it with them securely.`)
      close()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!user}
      busy={busy}
      onClose={close}
      title="Reset password"
      description={user ? <>For <strong className="text-ink">{user.full_name || user.email}</strong> ({user.email})</> : null}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Set password
          </button>
        </>
      }
    >
      <PasswordField id={id} label="New password" value={password} onChange={(v) => { setPassword(v); setError(null) }} />
      <ErrorNote error={error} />
    </Dialog>
  )
}

/* ---------- Change role ---------- */

export function RoleDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, msg: string) => void }) {
  const [role, setRole] = useState<AppRole>('user')
  const [team, setTeam] = useState<Team | ''>('')
  const [forId, setForId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Start from the user's current role each time the dialog opens for someone.
  if (user && forId !== user.id) {
    setForId(user.id)
    setRole(user.role)
    setTeam(user.team ?? '')
    setError(null)
  }

  async function submit() {
    if (!user) return
    if (role === 'coach' && !team) return setError('Choose the coach’s team: therapist or dietitian.')
    setBusy(true)
    try {
      const res = await adminSetUserRole(user.id, role, role === 'coach' ? (team as Team) : undefined)
      if (!res.ok) return setError(res.error)
      onDone({ ...user, role, team: role === 'coach' ? (team as Team) : null }, `${user.full_name || user.email} is now ${role === 'coach' ? `a ${TEAMS[team as Team].label.toLowerCase()} coach` : `a${role === 'admin' ? 'n' : ''} ${ROLE_LABEL[role].toLowerCase()}`}.`)
      setForId(null)
      onClose()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!user}
      busy={busy}
      onClose={() => {
        setForId(null)
        onClose()
      }}
      title="Change role"
      description={user ? <>For <strong className="text-ink">{user.full_name || user.email}</strong></> : null}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || (!!user && role === user.role && (role !== 'coach' || team === user.team))}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save role
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <RolePicker value={role} onChange={(r) => { setRole(r); setError(null) }} />
        {role === 'coach' && <TeamPicker value={team} onChange={(t) => { setTeam(t); setError(null) }} />}
        {user?.role === 'coach' && role !== 'coach' && <p className="text-sm text-muted">They’ll lose access to the {user.team ? TEAMS[user.team].label.toLowerCase() : 'team'}’s conversations.</p>}
      </div>
      <ErrorNote error={error} />
    </Dialog>
  )
}

/* ---------- Deactivate / reactivate ---------- */

export function ActivationDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const deactivating = !!user && !user.deactivated

  async function submit() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const res = deactivating ? await adminDeactivateUser(user.id) : await adminReactivateUser(user.id)
      if (!res.ok) return setError(res.error)
      onDone({ ...user, deactivated: deactivating }, `${user.full_name || user.email} ${deactivating ? 'has been deactivated' : 'can log in again'}.`)
      onClose()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!user}
      busy={busy}
      onClose={() => {
        setError(null)
        onClose()
      }}
      title={deactivating ? 'Deactivate account?' : 'Reactivate account?'}
      description={user ? <><strong className="text-ink">{user.full_name || user.email}</strong> ({user.email})</> : null}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={deactivating ? 'btn bg-alert text-white hover:bg-alert/90' : 'btn-primary'} onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {deactivating ? 'Deactivate' : 'Reactivate'}
          </button>
        </>
      }
    >
      {deactivating ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
          <li>They can’t log in, and their devices stop getting reminders.</li>
          <li>If they’re logged in right now, that session ends within an hour.</li>
          <li>Their data is kept. You can reactivate them at any time.</li>
          {user?.role === 'coach' && <li>Their open conversations go back to the {user.team ? TEAMS[user.team].label.toLowerCase() : 'team'} pool for another coach to claim.</li>}
        </ul>
      ) : (
        <p className="text-sm text-ink/80">They’ll be able to log in again with their existing password. Reminders resume once they turn notifications back on.</p>
      )}
      <ErrorNote error={error} />
    </Dialog>
  )
}

/** How many conversations a coach takes on at once (Sticky Queue). */
export function CapacityDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, msg: string) => void }) {
  const id = useId()
  const [value, setValue] = useState('')
  const [forId, setForId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user && forId !== user.id) {
    setForId(user.id)
    setValue(String(user.coach?.max ?? 10))
    setError(null)
  }

  const n = Number(value)
  const valid = value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= COACH_CAPACITY_MAX
  const load = user?.coach?.load ?? 0

  async function submit() {
    if (!user?.coach) return
    if (!valid) return setError(`Enter a whole number from 0 to ${COACH_CAPACITY_MAX}.`)
    setBusy(true)
    try {
      const res = await adminSetCoachCapacity(user.id, n)
      if (!res.ok) return setError(res.error)
      onDone({ ...user, coach: { ...user.coach, max: n } }, `${user.full_name || user.email} can now take up to ${n} conversation${n === 1 ? '' : 's'} at once.`)
      setForId(null)
      onClose()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!user}
      busy={busy}
      onClose={() => {
        setForId(null)
        onClose()
      }}
      title="Coach capacity"
      description={user ? <>For <strong className="text-ink">{user.full_name || user.email}</strong>{user.team ? ` · ${TEAMS[user.team].label}` : ''}</> : null}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || !valid || n === user?.coach?.max}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Save capacity
          </button>
        </>
      }
    >
      <Field label="Most conversations at once" htmlFor={id} hint={`Currently working on ${load}. New chats beyond this wait in the pool for another coach.`}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={COACH_CAPACITY_MAX}
          step={1}
          className="input w-32"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setError(null)
          }}
        />
      </Field>
      {valid && n < load && <p className="mt-3 text-sm text-muted">That’s below their current {load}. They keep those conversations but can’t claim more until they’re under {n}.</p>}
      <ErrorNote error={error} />
    </Dialog>
  )
}

/** Puts a coach's open conversations back in the pool, e.g. when they leave or are away. */
export function ReleaseChatsDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, msg: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = user?.coach?.load ?? 0
  const team = user?.team ? TEAMS[user.team].label.toLowerCase() : 'team'

  async function submit() {
    if (!user) return
    setBusy(true)
    setError(null)
    try {
      const res = await adminReleaseCoachChats(user.id)
      if (!res.ok) return setError(res.error)
      const n = res.data.released
      onDone(
        { ...user, coach: user.coach ? { ...user.coach, load: 0, accepting: false } : null },
        n ? `${n} conversation${n === 1 ? '' : 's'} from ${user.full_name || user.email} went back to the ${team} pool.` : `${user.full_name || user.email} had no open conversations. New chats are paused for them.`,
      )
      onClose()
    } catch {
      setError('Couldn’t reach the server. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={!!user}
      busy={busy}
      onClose={() => {
        setError(null)
        onClose()
      }}
      title="Release their conversations?"
      description={user ? <>For <strong className="text-ink">{user.full_name || user.email}</strong>{user.team ? ` · ${TEAMS[user.team].label}` : ''}</> : null}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Release {load ? `${load} conversation${load === 1 ? '' : 's'}` : 'and pause'}
          </button>
        </>
      }
    >
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
        <li>Their open conversations go back to the {team} pool, for another coach to claim. Employees keep their full history.</li>
        <li>“Accepting new” is switched off for them, so no new chats are routed to them. They can switch it back on in their portal.</li>
        <li>Closed conversations stay with them.</li>
      </ul>
      <p className="mt-3 text-sm text-muted">Deactivating a coach does this automatically.</p>
      <ErrorNote error={error} />
    </Dialog>
  )
}
