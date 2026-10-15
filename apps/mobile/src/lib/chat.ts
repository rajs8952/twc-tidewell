import { randomUUID } from 'expo-crypto'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { supabase } from './supabase'

/* ------------------------------------------------------------------
 * Chats with the wellness team, straight to Supabase as the signed-in
 * employee: the same tables, functions and row-level security as the
 * website (apps/web/lib/chat-data.ts, lib/messages.ts). Employees only
 * reach their own conversations and can only write as 'user'; the
 * database also checks they have Premium.
 * ------------------------------------------------------------------ */

export type SenderRole = 'user' | 'therapist'
export type ThreadStatus = 'unassigned' | 'in_progress' | 'resolved' | 'open' | 'closed'
export type Team = 'therapist' | 'dietitian'

export const isOpenStatus = (s: ThreadStatus | null | undefined) => s !== 'resolved' && s !== 'closed'

export const TEAMS: Record<Team, { label: string; accent: string; tint: string; intro: string }> = {
  therapist: { label: 'Therapist', accent: '#7C6BD6', tint: '#EFECFA', intro: 'Say as much or as little as you like: what’s on your mind, and what you’d like help with.' },
  dietitian: { label: 'Dietitian', accent: '#E9851F', tint: '#FCEDDB', intro: 'Ask about eating, energy, weight or a health goal. Mention any allergies or conditions that matter.' },
}
export const isTeam = (v: unknown): v is Team => v === 'therapist' || v === 'dietitian'

/** Mirrors the CHECK constraint on thread_messages.content. */
export const MAX_MESSAGE_LENGTH = 4000
export const MAX_THREAD_MESSAGES = 500
/** The reply-time promise shown to employees, in hours. */
export const REPLY_TARGET_HOURS = 24
/** How long a private image link lasts. */
export const CHAT_IMAGE_LINK_SECONDS = 60 * 60
const IMAGE_MAX_SIDE = 1600

export interface ThreadMessage {
  id: string
  thread_id: string
  sender_role: SenderRole
  content: string
  created_at: string
  /** "<thread_id>/<file>" in the private chat_media bucket, shown through a signed link. */
  media_url: string | null
  media_type: 'image' | null
}

export interface Receipts {
  user_delivered_at: string | null
  user_read_at: string | null
  coach_delivered_at: string | null
  coach_read_at: string | null
}

export interface Chat extends Partial<Receipts> {
  id: string
  team: Team
  status: ThreadStatus
  created_at: string
  last: Pick<ThreadMessage, 'sender_role' | 'content' | 'created_at' | 'media_url'> | null
  coach_name: string | null
  coach_title: string | null
  /** The coach's photo (coach-profile-presence.sql), if they've added one. */
  coach_avatar_url: string | null
  coach_online: boolean
}

const RECEIPT_COLUMNS = 'user_delivered_at, user_read_at, coach_delivered_at, coach_read_at'
const THREAD_COLUMNS = `id, team, status, created_at, ${RECEIPT_COLUMNS}`
const MESSAGE_COLUMNS = 'id, thread_id, sender_role, content, created_at, media_url, media_type'

export class ChatError extends Error {}

function fail(e: { code?: string; message: string }, context: 'send' | 'load'): never {
  if (e.code === 'PGRST205' || e.code === 'PGRST202') throw new ChatError('Messaging isn’t set up yet.')
  if (e.code === '42501') throw new ChatError(context === 'send' ? 'This conversation is closed or isn’t available.' : 'You don’t have access to this conversation.')
  if (/premium/i.test(e.message)) throw new ChatError('Chat with your wellness team is part of Premium.')
  if (/network|fetch/i.test(e.message)) throw new ChatError('Couldn’t reach OmniWell. Check your connection.')
  throw new ChatError(e.message)
}

export function validateMessage(content: string, hasImage = false): { ok: true; value: string } | { ok: false; error: string } {
  const value = content.trim()
  if (!value && !hasImage) return { ok: false, error: 'Write a message first.' }
  if (value.length > MAX_MESSAGE_LENGTH) return { ok: false, error: `Keep messages under ${MAX_MESSAGE_LENGTH.toLocaleString('en')} characters. You can send more than one.` }
  return { ok: true, value }
}

/** Merges messages by id, oldest first. */
export function mergeMessages(current: ThreadMessage[], incoming: ThreadMessage[]): ThreadMessage[] {
  if (!incoming.length) return current
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/* ---------- Receipts ---------- */

let deliveredUpTo: string | null = null

/** Tells the database the app has received the coaches' latest messages (only when something new arrived). */
function markDelivered(latest: string) {
  if (!latest || latest === deliveredUpTo) return
  deliveredUpTo = latest
  supabase.rpc('mark_threads_delivered').then(
    () => {},
    () => (deliveredUpTo = null),
  )
}

/** The conversation is open on screen: its messages count as read. */
export function markRead(threadId: string) {
  supabase.rpc('mark_thread_read', { p_thread: threadId }).then(
    () => {},
    () => {},
  )
}

/* ---------- Loading ---------- */

/** All the employee's conversations (both teams), newest activity first, with their last message and coach. */
export async function listMyChats(): Promise<Chat[]> {
  const [{ data: threads, error }, coaches, previews] = await Promise.all([
    supabase.from('therapist_threads').select(THREAD_COLUMNS).order('created_at', { ascending: false }).limit(50),
    supabase.rpc('my_chat_coaches'),
    supabase.rpc('my_chat_previews'),
  ])
  if (error) fail(error, 'load')
  if (!threads?.length) return []
  type Coach = { thread_id: string; coach_name: string; coach_title?: string | null; coach_avatar_url?: string | null; coach_online?: boolean }
  type Preview = Pick<ThreadMessage, 'thread_id' | 'sender_role' | 'content' | 'created_at' | 'media_url'>
  const coachOf = new Map(((coaches.data ?? []) as Coach[]).map((c) => [c.thread_id, c]))
  const last = new Map<string, Chat['last']>()
  for (const m of (previews.data ?? []) as Preview[]) if (!last.has(m.thread_id)) last.set(m.thread_id, { sender_role: m.sender_role, content: m.content, created_at: m.created_at, media_url: m.media_url })
  markDelivered(
    [...last]
      .filter(([, m]) => m?.sender_role === 'therapist')
      .map(([id, m]) => `${id}@${m?.created_at}`)
      .sort()
      .join(','),
  )
  return (threads as Omit<Chat, 'last' | 'coach_name' | 'coach_title' | 'coach_avatar_url' | 'coach_online'>[])
    .map((t) => {
      const c = coachOf.get(t.id)
      return { ...t, last: last.get(t.id) ?? null, coach_name: c?.coach_name ?? null, coach_title: c?.coach_title || null, coach_avatar_url: c?.coach_avatar_url ?? null, coach_online: !!c?.coach_online }
    })
    .sort((a, b) => (b.last?.created_at ?? b.created_at).localeCompare(a.last?.created_at ?? a.created_at))
}

/** How many conversations have a coach's reply the employee hasn't read (for the Chats tab badge). */
export function unreadCount(chats: Chat[]) {
  return chats.filter((c) => c.last?.sender_role === 'therapist' && (!c.user_read_at || Date.parse(c.last.created_at) > Date.parse(c.user_read_at))).length
}

export async function loadMessages(threadId: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase.from('thread_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId).order('created_at', { ascending: false }).limit(MAX_THREAD_MESSAGES)
  if (error) fail(error, 'load')
  return ((data ?? []) as ThreadMessage[]).reverse()
}

/** What's new since `newest` (with a few seconds' overlap), plus the thread's status and receipts. */
export async function pollThread(threadId: string, newest: string | null) {
  let q = supabase.from('thread_messages').select(MESSAGE_COLUMNS).eq('thread_id', threadId)
  if (newest) q = q.gte('created_at', new Date(Date.parse(newest) - 5_000).toISOString())
  const [msgs, thread] = await Promise.all([
    q.order('created_at', { ascending: true }).limit(100),
    supabase.from('therapist_threads').select(`status, ${RECEIPT_COLUMNS}`).eq('id', threadId).maybeSingle<{ status: ThreadStatus } & Receipts>(),
  ])
  if (msgs.error) fail(msgs.error, 'load')
  return { messages: (msgs.data ?? []) as ThreadMessage[], status: thread.data?.status ?? null, receipts: thread.data ?? null }
}

/* ---------- Sending ---------- */

/**
 * Opens a new conversation with this message (supabase/sticky-routing.sql):
 * straight to the employee's previous coach if they have room, else into the team's pool.
 */
export async function startConversation(team: Team, content: string) {
  const { data, error } = await supabase
    .rpc('submit_user_query', { p_category: team, p_message: content })
    .single<{ thread_id: string; status: 'in_progress' | 'unassigned'; assigned: boolean }>()
  if (error) fail(error, 'send')
  return { threadId: data.thread_id, status: data.status as ThreadStatus, assigned: data.assigned }
}

export async function sendMessage(threadId: string, content: string, imagePath?: string | null): Promise<ThreadMessage> {
  const { data, error } = await supabase
    .from('thread_messages')
    .insert({ thread_id: threadId, sender_role: 'user', content, ...(imagePath ? { media_url: imagePath, media_type: 'image' } : {}) })
    .select(MESSAGE_COLUMNS)
    .single<ThreadMessage>()
  if (error) fail(error, 'send')
  return data
}

/* ---------- Images ---------- */

/** Shrinks a picked photo (longest side 1,600 px) and re-encodes it as JPEG, which also drops its location data. */
export async function prepareImage(uri: string, width: number, height: number) {
  const ctx = ImageManipulator.manipulate(uri)
  if (Math.max(width, height) > IMAGE_MAX_SIDE) ctx.resize(width >= height ? { width: IMAGE_MAX_SIDE } : { height: IMAGE_MAX_SIDE })
  const img = await ctx.renderAsync()
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true })
  if (!out.base64) throw new ChatError('Couldn’t read that image. Try another one.')
  return { uri: out.uri, base64: out.base64 }
}

/**
 * Uploads a prepared image into the conversation's folder in the private
 * chat_media bucket, under a random name (the bucket's policies: only the
 * conversation's members, only while it's open, images only).
 */
export async function uploadImage(threadId: string, base64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  if (bytes.length > 3.5 * 1024 * 1024) throw new ChatError('That image is too large. Try a smaller one.')
  const name = randomUUID().replace(/-/g, '')
  const path = `${threadId.toLowerCase()}/${name}.jpg`
  const { error } = await supabase.storage.from('chat_media').upload(path, bytes, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' })
  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('row-level security') || m.includes('unauthorized') || m.includes('not allowed')) throw new ChatError('You can’t send images to this conversation (it may be closed).')
    throw new ChatError(`Couldn’t upload the image: ${error.message}`)
  }
  return path
}

/** Short-lived links for private chat images. */
export async function signImageUrls(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!paths.length) return out
  const { data, error } = await supabase.storage.from('chat_media').createSignedUrls(paths, CHAT_IMAGE_LINK_SECONDS)
  if (error) return out
  for (const r of data ?? []) if (r.path && r.signedUrl && !r.error) out.set(r.path, r.signedUrl)
  return out
}
