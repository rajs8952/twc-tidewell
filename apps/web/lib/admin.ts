/* ------------------------------------------------------------------
 * Admin portal: shared types and input checks. Safe for both the server
 * actions (app/actions/admin.ts) and the admin UI's forms; no secrets here.
 * Roles live in public.user_roles (supabase/rbac-and-chat-media.sql).
 * ------------------------------------------------------------------ */

import { AGE, HEIGHT_CM } from '@rajs8952/core/biometrics'
import { ACTIVITY_LEVELS, GENDERS, type Activity, type Gender } from '@rajs8952/core/hydration'
import { isTeam, type Team } from './messages'

export type { ActionResult } from '@rajs8952/core/types'

export type AppRole = 'admin' | 'coach' | 'user'
export const APP_ROLES: AppRole[] = ['user', 'coach', 'admin']
export const isAppRole = (v: unknown): v is AppRole => v === 'admin' || v === 'coach' || v === 'user'

/** Profile fields an admin can fill in when creating someone. */
export interface AdminProfileDetails {
  full_name: string
  weight_kg?: number
  height_cm?: number | null
  age?: number | null
  gender?: Gender
  activity_level?: Activity
  /** Required for coaches: which team's conversations they handle. */
  coach_team?: Team
}

/** One row of the admin user list. */
export interface AdminUser {
  id: string
  email: string | null
  full_name: string
  role: AppRole
  /** Coaches only: their team. */
  team: Team | null
  /** Coaches only: conversations in progress, the most they take on, and whether new chats route straight to them. */
  coach: { load: number; max: number; accepting: boolean } | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  deactivated: boolean
}

/** Mirrors the CHECK on coach_profiles.max_capacity. */
export const COACH_CAPACITY_MAX = 500

export const PASSWORD_MIN = 8
/** Supabase (bcrypt) ignores anything past 72 bytes; refuse rather than silently truncate. */
export const PASSWORD_MAX = 72

const fail = (error: string) => ({ ok: false as const, error })

export function validatePassword(p: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof p !== 'string' || p.length < PASSWORD_MIN) return fail(`Use at least ${PASSWORD_MIN} characters for the password.`)
  if (new TextEncoder().encode(p).length > PASSWORD_MAX) return fail(`Keep the password under ${PASSWORD_MAX} characters.`)
  return { ok: true, value: p }
}

export function validateEmail(e: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const v = typeof e === 'string' ? e.trim().toLowerCase() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 254) return fail('Enter a valid email address.')
  return { ok: true, value: v }
}

const isGender = (v: unknown): v is Gender => GENDERS.some((g) => g.id === v)
const isActivity = (v: unknown): v is Activity => ACTIVITY_LEVELS.some((a) => a.id === v)

/** Checks the new user's details; the same limits the app's own Profile page uses. */
export function validateNewUser(input: { email: unknown; password: unknown; role: unknown; profile: unknown }):
  | { ok: true; value: { email: string; password: string; role: AppRole; profile: AdminProfileDetails } }
  | { ok: false; error: string } {
  const email = validateEmail(input.email)
  if (!email.ok) return email
  const password = validatePassword(input.password)
  if (!password.ok) return password
  if (!isAppRole(input.role)) return fail('Choose a role: user, coach or admin.')

  const p = (input.profile ?? {}) as Partial<AdminProfileDetails>
  const full_name = typeof p.full_name === 'string' ? p.full_name.trim() : ''
  if (!full_name || full_name.length > 120) return fail('Enter their name (up to 120 characters).')
  if (p.weight_kg !== undefined && !(typeof p.weight_kg === 'number' && p.weight_kg >= 25 && p.weight_kg <= 300)) return fail('Weight must be between 25 and 300 kg.')
  if (p.height_cm != null && !(typeof p.height_cm === 'number' && p.height_cm >= HEIGHT_CM.min && p.height_cm <= HEIGHT_CM.max)) {
    return fail(`Height must be between ${HEIGHT_CM.min} and ${HEIGHT_CM.max} cm.`)
  }
  if (p.age != null && !(Number.isInteger(p.age) && p.age >= AGE.min && p.age <= AGE.max)) return fail(`Age must be a whole number from ${AGE.min} to ${AGE.max}.`)
  if (p.gender !== undefined && !isGender(p.gender)) return fail('Choose a valid sex option.')
  if (p.activity_level !== undefined && !isActivity(p.activity_level)) return fail('Choose a valid activity level.')
  if (input.role === 'coach' && !isTeam(p.coach_team)) return fail('Choose the coach’s team: therapist or dietitian.')

  return {
    ok: true,
    value: {
      email: email.value,
      password: password.value,
      role: input.role,
      profile: {
        full_name,
        weight_kg: p.weight_kg,
        height_cm: p.height_cm ?? null,
        age: p.age ?? null,
        gender: p.gender,
        activity_level: p.activity_level,
        coach_team: input.role === 'coach' ? p.coach_team : undefined,
      },
    },
  }
}
