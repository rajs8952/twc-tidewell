/* ------------------------------------------------------------------
 * "Chat with a therapist": asynchronous secure messaging (an inbox, not
 * live chat). Shared types and validation, imported by both the server
 * actions (app/actions/messages.ts) and the client UI, so it must stay
 * free of server-only or browser-only code.
 * Tables and row-level security: supabase/therapist-messaging.sql.
 * ------------------------------------------------------------------ */

export type { ActionResult } from './types'

/** 'therapist' here means "wellness staff"; the thread's team says which kind. */
export type SenderRole = 'user' | 'therapist'
export type ThreadStatus = 'open' | 'closed'

/** Which wellness team a conversation is with. Each team only sees its own. */
export type Team = 'therapist' | 'dietitian'

export const TEAMS: Record<Team, { label: string; plural: string; inboxPath: string; portalPath: string; accent: string; intro: string }> = {
  therapist: {
    label: 'Therapist',
    plural: 'therapists',
    inboxPath: '/messages/therapist',
    portalPath: '/therapist',
    accent: '#7C6BD6',
    intro: 'Say as much or as little as you like: what’s on your mind, and what you’d like help with.',
  },
  dietitian: {
    label: 'Dietitian',
    plural: 'dietitians',
    inboxPath: '/messages/dietitian',
    portalPath: '/dietitian',
    accent: '#E9851F',
    intro: 'Ask about eating, energy, weight or a health goal. Mention any allergies or conditions that matter.',
  },
}

export const isTeam = (v: unknown): v is Team => v === 'therapist' || v === 'dietitian'

/** Mirrors the CHECK constraint on thread_messages.content. */
export const MAX_MESSAGE_LENGTH = 4000

/** Most messages one thread returns; an EAP conversation is far shorter. */
export const MAX_THREAD_MESSAGES = 500

export interface ThreadMessage {
  id: string
  thread_id: string
  sender_role: SenderRole
  content: string
  created_at: string
}

export interface TherapistThread {
  id: string
  team: Team
  status: ThreadStatus
  created_at: string
}

export const MESSAGE_COLUMNS = 'id, thread_id, sender_role, content, created_at'
export const THREAD_COLUMNS = 'id, team, status, created_at'

/** Trims the message and checks its length; the database enforces the same rule. */
export function validateMessage(content: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof content !== 'string') return { ok: false, error: 'Write a message first.' }
  const value = content.trim()
  if (!value) return { ok: false, error: 'Write a message first.' }
  if (value.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString('en')} characters. You can send more than one.` }
  }
  return { ok: true, value }
}

/* ---------- Therapist portal (supabase/therapist-portal.sql) ---------- */

/** A thread message as therapists see it, with who sent it. */
export interface StaffThreadMessage extends ThreadMessage {
  sender_id: string | null
}

export const STAFF_MESSAGE_COLUMNS = `${MESSAGE_COLUMNS}, sender_id`

/** One row of the therapist queue (the therapist_queue() function). */
export interface QueueItem {
  thread_id: string
  team: Team
  status: ThreadStatus
  created_at: string
  user_id: string
  user_name: string
  user_email: string | null
  message_count: number
  last_message_at: string | null
  last_sender_role: SenderRole | null
  last_message: string | null
  /** When the employee's unanswered messages began; null when nothing is waiting. */
  waiting_since: string | null
}

/** The reply-time promise shown to employees, in hours. */
export const REPLY_TARGET_HOURS = 24
