'use server'

import { birthYearFromAge } from '@rajs8952/core/biometrics'
import type { SupabaseClient } from '@supabase/supabase-js'
import { COACH_CAPACITY_MAX, isAppRole, validateNewUser, validatePassword, type ActionResult, type AdminProfileDetails, type AdminUser, type AppRole } from '@/lib/admin'
import { isTeam, type Team } from '@/lib/messages'
import { SIGNED_OUT, isUuid, signedIn } from '@/lib/supabase/actions'
import { supabaseAdmin } from '@/lib/supabase/admin'

/* ------------------------------------------------------------------
 * Admin portal server actions (Supabase Auth Admin API).
 *
 * Server actions are public endpoints, so EVERY action first checks, with
 * the caller's own session, that they are an admin (is_admin() in
 * supabase/rbac-and-chat-media.sql). Only then is the service-role client
 * used (lib/supabase/admin.ts). Errors never include keys or raw internals.
 * ------------------------------------------------------------------ */

const NOT_ADMIN = 'Only admins can do this.'
const NO_KEY = 'The admin service isn’t configured on the server (SUPABASE_SERVICE_ROLE_KEY).'
/** Supabase's "ban" length for deactivating: about 100 years. */
const DEACTIVATE_FOR = '876000h'

type AdminContext = { adminId: string; admin: SupabaseClient }

/** The calling admin and the service-role client, or the reason they can't proceed. */
async function requireAdmin(): Promise<AdminContext | { error: string }> {
  const session = await signedIn()
  if (!session) return { error: SIGNED_OUT }
  const { data, error } = await session.supabase.rpc('is_admin')
  if (error || data !== true) return { error: NOT_ADMIN }
  const admin = supabaseAdmin()
  if (!admin) return { error: NO_KEY }
  return { adminId: session.userId, admin }
}

/** A short audit line in the server logs: who did what to whom (ids only, nothing secret). */
function audit(ctx: AdminContext, action: string, target: string, extra = '') {
  console.info(`[admin] ${action} by ${ctx.adminId} on ${target}${extra ? ` (${extra})` : ''}`)
}

function friendlyAuthError(message: string) {
  if (/already (been )?registered|already exists/i.test(message)) return 'A user with this email already exists.'
  if (/password/i.test(message)) return `Password not accepted: ${message}`
  return message
}

/** Sets someone's role, and their team when they're a coach (kept in public.therapists for the chat). */
async function applyRole(admin: SupabaseClient, userId: string, role: AppRole, team: Team | undefined, displayName: string) {
  const { error } = await admin.from('user_roles').upsert({ user_id: userId, role }, { onConflict: 'user_id' })
  if (error) throw new Error(error.code === '23514' ? error.message : `Couldn’t save the role: ${error.message}`)
  if (role === 'coach') {
    // Keep a name the coach has chosen (My profile); only new coaches start from their profile name.
    const { data: existing } = await admin.from('therapists').select('user_id').eq('user_id', userId).maybeSingle()
    const { error: teamError } = existing
      ? await admin.from('therapists').update({ team }).eq('user_id', userId)
      : await admin.from('therapists').insert({ user_id: userId, team, display_name: displayName.slice(0, 120) })
    if (teamError) throw new Error(`Couldn’t set the coach’s team: ${teamError.message}`)
  } else {
    // No longer a coach: remove their access to the team's conversations.
    const { error: teamError } = await admin.from('therapists').delete().eq('user_id', userId)
    if (teamError) throw new Error(`Couldn’t remove the coach’s team access: ${teamError.message}`)
  }
}

/* ---------- Create ---------- */

/**
 * Creates a confirmed account with a password, then saves their role and
 * profile. If any later step fails, the new account is deleted again so
 * nothing is left half-made.
 */
export async function adminCreateUser(email: string, password: string, role: AppRole, profileDetails: AdminProfileDetails): Promise<ActionResult<AdminUser>> {
  const parsed = validateNewUser({ email, password, role, profile: profileDetails })
  if (!parsed.ok) return parsed
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { admin } = ctx
  const { profile } = parsed.value

  // The sign-up trigger (handle_new_user in schema.sql) creates the profile from this metadata.
  const { data, error } = await admin.auth.admin.createUser({
    email: parsed.value.email,
    password: parsed.value.password,
    email_confirm: true,
    user_metadata: {
      full_name: profile.full_name,
      ...(profile.weight_kg !== undefined && { weight_kg: profile.weight_kg }),
      ...(profile.gender && { gender: profile.gender }),
      ...(profile.activity_level && { activity_level: profile.activity_level }),
    },
  })
  if (error || !data.user) return { ok: false, error: friendlyAuthError(error?.message ?? 'Couldn’t create the account.') }
  const user = data.user

  try {
    // Fill in the rest (and create the row if the trigger isn't installed).
    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: user.id,
        full_name: profile.full_name,
        ...(profile.weight_kg !== undefined && { weight_kg: profile.weight_kg }),
        ...(profile.gender && { gender: profile.gender }),
        ...(profile.activity_level && { activity_level: profile.activity_level }),
        height_cm: profile.height_cm ?? null,
        birth_year: profile.age != null ? birthYearFromAge(profile.age) : null,
      },
      { onConflict: 'id' },
    )
    if (profileError) throw new Error(`Couldn’t save the profile: ${profileError.message}`)
    await applyRole(admin, user.id, parsed.value.role, profile.coach_team, profile.full_name)
  } catch (e) {
    await admin.auth.admin.deleteUser(user.id).catch(() => {})
    return { ok: false, error: `${(e as Error).message} The account was not created.` }
  }

  audit(ctx, 'create user', user.id, parsed.value.role)
  return {
    ok: true,
    data: {
      id: user.id,
      email: user.email ?? parsed.value.email,
      full_name: profile.full_name,
      role: parsed.value.role,
      team: parsed.value.role === 'coach' ? (profile.coach_team ?? null) : null,
      // A new coach starts with the database defaults (sticky-queue.sql).
      coach: parsed.value.role === 'coach' ? { load: 0, max: 10, accepting: true } : null,
      created_at: user.created_at,
      last_sign_in_at: null,
      email_confirmed: true,
      deactivated: false,
    },
  }
}

/* ---------- Update ---------- */

/** Sets a new password for someone (they aren't emailed; tell them yourself). */
export async function adminUpdateUserPassword(userId: string, newPassword: string): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  const parsed = validatePassword(newPassword)
  if (!parsed.ok) return parsed
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const { error } = await ctx.admin.auth.admin.updateUserById(userId, { password: parsed.value })
  if (error) return { ok: false, error: friendlyAuthError(error.message) }
  audit(ctx, 'reset password', userId)
  return { ok: true, data: null }
}

/** Changes someone's role (and a coach's team). The last admin can't be demoted. */
export async function adminSetUserRole(userId: string, role: AppRole, team?: Team): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  if (!isAppRole(role)) return { ok: false, error: 'Choose a role: user, coach or admin.' }
  if (role === 'coach' && !isTeam(team)) return { ok: false, error: 'Choose the coach’s team: therapist or dietitian.' }
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const { data: profile } = await ctx.admin.from('profiles').select('full_name').eq('id', userId).maybeSingle<{ full_name: string }>()
  try {
    await applyRole(ctx.admin, userId, role, team, profile?.full_name ?? '')
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  audit(ctx, 'set role', userId, role === 'coach' ? `coach/${team}` : role)
  return { ok: true, data: null }
}

/* ---------- Coach capacity (Sticky Queue) ---------- */

/**
 * Sets the most conversations a coach takes on at once. Lowering it below
 * their current load is allowed: they keep those chats but can't claim more.
 */
export async function adminSetCoachCapacity(userId: string, maxCapacity: number): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  if (!Number.isInteger(maxCapacity) || maxCapacity < 0 || maxCapacity > COACH_CAPACITY_MAX) {
    return { ok: false, error: `Capacity must be a whole number from 0 to ${COACH_CAPACITY_MAX}.` }
  }
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const { data, error } = await ctx.admin.from('coach_profiles').update({ max_capacity: maxCapacity }).eq('user_id', userId).select('user_id').maybeSingle()
  if (error) return { ok: false, error: error.code === 'PGRST205' ? 'Coach capacity isn’t set up yet. Run supabase/sticky-queue.sql first.' : error.message }
  if (!data) return { ok: false, error: 'That account isn’t a coach.' }
  audit(ctx, 'set capacity', userId, String(maxCapacity))
  return { ok: true, data: null }
}

/**
 * Puts all of a coach's open conversations back in their team's pool for
 * colleagues to claim, and pauses new chats being routed to them. For when a
 * coach leaves or is away. Returns how many conversations were released.
 */
export async function adminReleaseCoachChats(userId: string): Promise<ActionResult<{ released: number }>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { data, error } = await ctx.admin.rpc('admin_release_coach_threads', { p_coach: userId })
  if (error) return { ok: false, error: error.code === 'PGRST202' ? 'Releasing isn’t set up yet. Run supabase/chat-receipts-and-scoping.sql first.' : error.message }
  audit(ctx, 'release chats', userId, String(data))
  return { ok: true, data: { released: Number(data) || 0 } }
}

/* ---------- Deactivate / reactivate ---------- */

/**
 * Deactivates an account: they can't log in or refresh their session, and
 * their devices stop getting reminders. A session already open keeps
 * working until its access token expires (at most an hour). Reversible.
 */
export async function adminDeactivateUser(userId: string): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  if (userId === ctx.adminId) return { ok: false, error: 'You can’t deactivate your own account.' }

  // Don't lock everyone out: an admin can only be deactivated if another active admin remains.
  const { data: role } = await ctx.admin.from('user_roles').select('role').eq('user_id', userId).maybeSingle<{ role: AppRole }>()
  if (role?.role === 'admin') {
    const { data: admins } = await ctx.admin.from('user_roles').select('user_id').eq('role', 'admin').neq('user_id', userId)
    if (!admins?.length) return { ok: false, error: 'This is the only admin. Make someone else an admin first.' }
  }

  const { error } = await ctx.admin.auth.admin.updateUserById(userId, { ban_duration: DEACTIVATE_FOR })
  if (error) return { ok: false, error: error.message }
  await ctx.admin.from('push_subscriptions').delete().eq('user_id', userId)
  // A deactivated coach can't answer: their open conversations go back to the pool.
  if (role?.role === 'coach') {
    const { error: releaseError } = await ctx.admin.rpc('admin_release_coach_threads', { p_coach: userId })
    if (releaseError && releaseError.code !== 'PGRST202') console.error('[admin] releasing chats on deactivate failed:', releaseError.message)
  }
  audit(ctx, 'deactivate', userId)
  return { ok: true, data: null }
}

/** Lets a deactivated account log in again. */
export async function adminReactivateUser(userId: string): Promise<ActionResult<null>> {
  if (!isUuid(userId)) return { ok: false, error: 'Unknown user.' }
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }

  const { error } = await ctx.admin.auth.admin.updateUserById(userId, { ban_duration: 'none' })
  if (error) return { ok: false, error: error.message }
  audit(ctx, 'reactivate', userId)
  return { ok: true, data: null }
}

/* ---------- List ---------- */

const PER_PAGE = 1000
const MAX_PAGES = 10
const ID_CHUNK = 200

/** Every account with its role, name and (for coaches) team, newest first. Up to 10,000 accounts. */
export async function adminGetUsers(): Promise<ActionResult<AdminUser[]>> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { admin } = ctx

  const users: { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; banned_until?: string | null }[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE })
    if (error) return { ok: false, error: error.message }
    users.push(...data.users)
    if (data.users.length < PER_PAGE) break
  }

  // Roles, names and coach teams, fetched in chunks (keeps each request URL short).
  const roles = new Map<string, AppRole>()
  const names = new Map<string, string>()
  const teams = new Map<string, Team>()
  const coaches = new Map<string, AdminUser['coach']>()
  for (let i = 0; i < users.length; i += ID_CHUNK) {
    const ids = users.slice(i, i + ID_CHUNK).map((u) => u.id)
    const [r, p, t, c] = await Promise.all([
      admin.from('user_roles').select('user_id, role').in('user_id', ids),
      admin.from('profiles').select('id, full_name').in('id', ids),
      admin.from('therapists').select('user_id, team').in('user_id', ids),
      admin.from('coach_profiles').select('user_id, current_load, max_capacity, is_accepting_new').in('user_id', ids),
    ])
    if (r.error || p.error || t.error) return { ok: false, error: (r.error ?? p.error ?? t.error)!.message }
    for (const x of r.data as { user_id: string; role: AppRole }[]) roles.set(x.user_id, x.role)
    for (const x of p.data as { id: string; full_name: string }[]) names.set(x.id, x.full_name)
    for (const x of t.data as { user_id: string; team: Team }[]) teams.set(x.user_id, x.team)
    // Optional: absent before supabase/sticky-queue.sql.
    for (const x of (c.data ?? []) as { user_id: string; current_load: number; max_capacity: number; is_accepting_new: boolean }[]) {
      coaches.set(x.user_id, { load: x.current_load, max: x.max_capacity, accepting: x.is_accepting_new })
    }
  }

  const now = Date.now()
  return {
    ok: true,
    data: users
      .map((u) => ({
        id: u.id,
        email: u.email ?? null,
        full_name: names.get(u.id) ?? '',
        role: roles.get(u.id) ?? 'user',
        team: teams.get(u.id) ?? null,
        coach: coaches.get(u.id) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed: !!u.email_confirmed_at,
        deactivated: !!u.banned_until && Date.parse(u.banned_until) > now,
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at)),
  }
}
