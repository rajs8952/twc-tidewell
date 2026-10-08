'use client'

import { Ban, KeyRound, RotateCw, Search, ShieldCheck, UserCog, UserPlus, Users, UserCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminGetUsers } from '@/app/actions/admin'
import { errorMessage } from '@rajs8952/core/errors'
import type { AdminUser, AppRole } from '@/lib/admin'
import { TEAMS } from '@/lib/messages'
import { trackProgress } from '@/lib/progress'
import { createClient } from '@/lib/supabase/client'
import { ActivationDialog, AddUserDialog, ROLE_LABEL, ResetPasswordDialog, RoleDialog } from './UserDialogs'

/* ------------------------------------------------------------------
 * Admin portal: everyone's account, role and status, with add user,
 * change role, reset password and deactivate/reactivate. Data comes from
 * the admin server actions (app/actions/admin.ts), which re-check that
 * the caller is an admin on every call.
 * ------------------------------------------------------------------ */

type Filter = 'all' | AppRole | 'deactivated'
const FILTER_LABEL: Record<Filter, string> = { all: 'All', user: 'Users', coach: 'Coaches', admin: 'Admins', deactivated: 'Deactivated' }

const ROLE_STYLE: Record<AppRole, string> = {
  admin: 'bg-ink text-white',
  coach: 'bg-[#EDE9FB] text-[#4B3A9E]',
  user: 'bg-mist text-ink',
}

const dateLabel = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never')

function RoleBadge({ user }: { user: AdminUser }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${ROLE_STYLE[user.role]}`}>
      {user.role === 'admin' && <ShieldCheck className="h-3 w-3" aria-hidden />}
      {ROLE_LABEL[user.role]}
      {user.role === 'coach' && user.team && <span className="font-semibold">· {TEAMS[user.team].label}</span>}
    </span>
  )
}

function StatusBadge({ user }: { user: AdminUser }) {
  if (user.deactivated) return <span className="inline-flex items-center gap-1 rounded-full bg-alert/10 px-2.5 py-0.5 text-xs font-bold text-alert"><Ban className="h-3 w-3" aria-hidden />Deactivated</span>
  if (!user.email_confirmed) return <span className="inline-flex rounded-full bg-[#FFF1D6] px-2.5 py-0.5 text-xs font-bold text-[#8A5A00]">Unconfirmed</span>
  return <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">Active</span>
}

function Initials({ user }: { user: AdminUser }) {
  const name = user.full_name || user.email || '?'
  const letters = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mist text-xs font-bold text-ink ring-1 ring-line" aria-hidden>
      {letters}
    </span>
  )
}

/** The row's actions as small labelled buttons (no hidden menus, easy to reach by keyboard). */
function RowActions({ user, isMe, onRole, onPassword, onActivation }: { user: AdminUser; isMe: boolean; onRole: () => void; onPassword: () => void; onActivation: () => void }) {
  const btn = 'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold ring-1 ring-line transition hover:bg-mist'
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" onClick={onRole} className={btn} aria-label={`Change role for ${user.full_name || user.email}`}>
        <UserCog className="h-3.5 w-3.5" aria-hidden /> Role
      </button>
      <button type="button" onClick={onPassword} className={btn} aria-label={`Reset password for ${user.full_name || user.email}`}>
        <KeyRound className="h-3.5 w-3.5" aria-hidden /> Password
      </button>
      {!isMe && (
        <button
          type="button"
          onClick={onActivation}
          className={`${btn} ${user.deactivated ? 'text-emerald-700' : 'text-alert'}`}
          aria-label={`${user.deactivated ? 'Reactivate' : 'Deactivate'} ${user.full_name || user.email}`}
        >
          {user.deactivated ? <UserCheck className="h-3.5 w-3.5" aria-hidden /> : <Ban className="h-3.5 w-3.5" aria-hidden />}
          {user.deactivated ? 'Reactivate' : 'Deactivate'}
        </button>
      )}
    </div>
  )
}

export function AdminPortal() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [roleFor, setRoleFor] = useState<AdminUser | null>(null)
  const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null)
  const [activationFor, setActivationFor] = useState<AdminUser | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [me, setMe] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await adminGetUsers()
      if (!res.ok) return setLoadError(res.error)
      setUsers(res.data)
      setLoadError(null)
    } catch (e) {
      setLoadError(errorMessage(e))
    }
  }, [])

  useEffect(() => {
    trackProgress(load())
    // Who "you" are, so the list can mark your own row and hide self-deactivation.
    createClient().auth.getSession().then(({ data }) => setMe(data.session?.user.id ?? null))
  }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const replace = (u: AdminUser) => setUsers((list) => list?.map((x) => (x.id === u.id ? u : x)) ?? list)

  const counts = useMemo(() => {
    const list = users ?? []
    return {
      all: list.length,
      user: list.filter((u) => u.role === 'user').length,
      coach: list.filter((u) => u.role === 'coach').length,
      admin: list.filter((u) => u.role === 'admin').length,
      deactivated: list.filter((u) => u.deactivated).length,
    }
  }, [users])

  const q = query.trim().toLowerCase()
  const shown = (users ?? []).filter((u) => {
    if (filter === 'deactivated' ? !u.deactivated : filter !== 'all' && u.role !== filter) return false
    return !q || u.full_name.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)
  })

  const tiles: { label: string; value: number; icon: typeof Users; filter: Filter }[] = [
    { label: 'Total accounts', value: counts.all, icon: Users, filter: 'all' },
    { label: 'Coaches', value: counts.coach, icon: UserCog, filter: 'coach' },
    { label: 'Admins', value: counts.admin, icon: ShieldCheck, filter: 'admin' },
    { label: 'Deactivated', value: counts.deactivated, icon: Ban, filter: 'deactivated' },
  ]

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold sm:text-4xl">Users</h1>
          <p className="mt-1 text-muted">Create accounts, assign roles and manage access.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => trackProgress(load())} className="btn-secondary px-4" aria-label="Refresh the list">
            <RotateCw className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={() => setAdding(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" aria-hidden /> Add user
          </button>
        </div>
      </div>

      {/* Summary tiles double as filters. */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon
          const on = filter === t.filter
          return (
            <button
              key={t.label}
              type="button"
              onClick={() => setFilter(t.filter)}
              aria-pressed={on}
              className={`flex items-center gap-3 rounded-3xl bg-white p-4 text-left ring-1 transition ${on ? 'ring-2 ring-ink' : 'ring-line hover:ring-ink/30'}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-mist text-ink">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span>
                <span className="block font-display text-2xl font-extrabold tabular-nums leading-none">{users ? t.value : '–'}</span>
                <span className="text-xs font-semibold text-muted">{t.label}</span>
              </span>
            </button>
          )
        })}
      </div>

      <section aria-label="Accounts" className="overflow-hidden rounded-3xl bg-white ring-1 ring-line">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block sm:w-80">
            <span className="sr-only">Search by name or email</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or email" className="input py-2.5 pl-10" />
          </label>
          <div role="tablist" aria-label="Filter by role" className="flex flex-wrap gap-1.5">
            {(['all', 'user', 'coach', 'admin', 'deactivated'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1.5 text-sm font-bold transition ${filter === f ? 'bg-ink text-white' : 'bg-mist text-muted hover:text-ink'}`}
              >
                {FILTER_LABEL[f]} <span className="tabular-nums opacity-80">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>

        {loadError ? (
          <p role="alert" className="notice-error m-4">{loadError}</p>
        ) : users === null ? (
          <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading accounts">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-2xl bg-mist/70 motion-safe:animate-pulse" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted">{q ? 'No accounts match your search.' : 'No accounts here.'}</p>
        ) : (
          <>
            {/* Desktop: a table. */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-mist/60 text-xs font-bold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-4 py-3">Account</th>
                  <th scope="col" className="px-4 py-3">Role</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Joined</th>
                  <th scope="col" className="px-4 py-3">Last login</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((u) => (
                  <tr key={u.id} className={u.deactivated ? 'bg-mist/30' : undefined}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Initials user={u} />
                        <div className="min-w-0">
                          <p className="truncate font-bold">
                            {u.full_name || '(no name)'} {u.id === me && <span className="text-xs font-semibold text-muted">· you</span>}
                          </p>
                          <p className="truncate text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><RoleBadge user={u} /></td>
                    <td className="px-4 py-3"><StatusBadge user={u} /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dateLabel(u.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{dateLabel(u.last_sign_in_at)}</td>
                    <td className="px-4 py-3">
                      <RowActions user={u} isMe={u.id === me} onRole={() => setRoleFor(u)} onPassword={() => setPasswordFor(u)} onActivation={() => setActivationFor(u)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Phones: cards. */}
            <ul className="divide-y divide-line md:hidden">
              {shown.map((u) => (
                <li key={u.id} className="space-y-3 p-4">
                  <div className="flex items-start gap-3">
                    <Initials user={u} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {u.full_name || '(no name)'} {u.id === me && <span className="text-xs font-semibold text-muted">· you</span>}
                      </p>
                      <p className="truncate text-xs text-muted">{u.email}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <RoleBadge user={u} />
                        <StatusBadge user={u} />
                      </div>
                      <p className="mt-1.5 text-xs text-muted">
                        Joined {dateLabel(u.created_at)} · Last login {dateLabel(u.last_sign_in_at)}
                      </p>
                    </div>
                  </div>
                  <RowActions user={u} isMe={u.id === me} onRole={() => setRoleFor(u)} onPassword={() => setPasswordFor(u)} onActivation={() => setActivationFor(u)} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <AddUserDialog
        open={adding}
        onClose={() => setAdding(false)}
        onCreated={(u) => {
          setUsers((list) => [u, ...(list ?? [])])
          setAdding(false)
          setToast(`${u.full_name} was added as ${u.role === 'coach' && u.team ? `a ${TEAMS[u.team].label.toLowerCase()} coach` : `a${u.role === 'admin' ? 'n' : ''} ${ROLE_LABEL[u.role].toLowerCase()}`}. They can log in now.`)
        }}
      />
      <RoleDialog user={roleFor} onClose={() => setRoleFor(null)} onDone={(u, msg) => { replace(u); setToast(msg) }} />
      <ResetPasswordDialog user={passwordFor} onClose={() => setPasswordFor(null)} onDone={setToast} />
      <ActivationDialog user={activationFor} onClose={() => setActivationFor(null)} onDone={(u, msg) => { replace(u); setToast(msg) }} />

      {toast && (
        <div role="status" className="fixed inset-x-4 bottom-6 z-[60] mx-auto max-w-md rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {toast}
        </div>
      )}
    </>
  )
}
