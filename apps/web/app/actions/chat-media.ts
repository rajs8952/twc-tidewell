'use server'

import { randomUUID } from 'node:crypto'
import { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_TYPES, type ChatImageType } from '@/lib/messages'
import { SIGNED_OUT, isUuid, signedIn } from '@/lib/supabase/actions'
import type { ActionResult } from '@rajs8952/core/types'

/*
 * Chat image upload. Images only: the file's own bytes must be a JPEG, PNG or
 * WebP (its name and declared type aren't trusted), so PDFs, videos and
 * anything renamed to look like an image are refused.
 *
 * It uploads as the signed-in user, so the chat_media bucket's row-level
 * security (supabase/rbac-and-chat-media.sql) decides whether they may: only
 * the thread's employee or that team's staff, and only while it's open.
 */

/** Identifies the image format from the file's first bytes ("magic numbers"). */
function sniff(bytes: Uint8Array): ChatImageType | null {
  const at = (i: number, ...sig: number[]) => sig.every((b, k) => bytes[i + k] === b)
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  // "RIFF" … "WEBP"
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  return null
}

/**
 * Uploads one image for a chat message. FormData fields: `file` (the image)
 * and `threadId`. Returns the stored path, which goes in the message's
 * media_url. The message itself is sent separately, as usual.
 */
export async function uploadChatImage(formData: FormData): Promise<ActionResult<{ path: string }>> {
  const file = formData.get('file')
  const threadId = formData.get('threadId')
  if (!(file instanceof File)) return { ok: false, error: 'Choose an image to send.' }
  if (typeof threadId !== 'string' || !isUuid(threadId)) return { ok: false, error: 'That conversation wasn’t found.' }
  if (file.size === 0) return { ok: false, error: 'That image is empty.' }
  if (file.size > CHAT_IMAGE_MAX_BYTES) return { ok: false, error: 'That image is too large. Try a smaller one.' }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniff(bytes)
  if (!type) return { ok: false, error: 'Only images can be shared (JPEG, PNG or WebP). Videos, PDFs and other files aren’t allowed.' }

  const session = await signedIn()
  if (!session) return { ok: false, error: SIGNED_OUT }

  // A random, unguessable name inside the thread's own folder, as the bucket's policies require.
  const path = `${threadId.toLowerCase()}/${randomUUID().replace(/-/g, '')}.${CHAT_IMAGE_TYPES[type]}`
  const { error } = await session.supabase.storage.from('chat_media').upload(path, bytes, { contentType: type, upsert: false, cacheControl: '3600' })
  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('row-level security') || msg.includes('unauthorized') || msg.includes('not allowed')) {
      return { ok: false, error: 'You can’t send images to this conversation (it may be closed).' }
    }
    if (msg.includes('bucket not found')) return { ok: false, error: 'Image sharing isn’t set up yet. Run supabase/rbac-and-chat-media.sql in Supabase first.' }
    if (msg.includes('too large') || msg.includes('maximum')) return { ok: false, error: 'That image is too large. Try a smaller one.' }
    return { ok: false, error: `Couldn’t upload the image: ${error.message}` }
  }
  return { ok: true, data: { path } }
}
