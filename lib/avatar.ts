import type { SupabaseClient } from '@supabase/supabase-js'
import { blobToDataUrl, dataUrlToBlob } from './image'

const PENDING_KEY = 'tidewell:pending-avatar'

/** Uploads to avatars/<uid>/avatar and stores a cache-busted public URL on the profile. */
export async function uploadAvatar(supabase: SupabaseClient, userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/avatar`
  const { error } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp', cacheControl: '3600' })
  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${data.publicUrl}?v=${Date.now()}`

  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  if (updateError) throw updateError
  return url
}

/**
 * When email confirmation is on, sign-up returns no session, so storage
 * rules won't accept the upload yet. We keep the (already small) image
 * locally and upload it on the first signed-in visit.
 */
export async function stashPendingAvatar(blob: Blob) {
  try {
    localStorage.setItem(PENDING_KEY, await blobToDataUrl(blob))
  } catch {
    /* storage full or unavailable — the user can add a photo from Profile later */
  }
}

export async function flushPendingAvatar(supabase: SupabaseClient, userId: string): Promise<string | null> {
  let dataUrl: string | null = null
  try {
    dataUrl = localStorage.getItem(PENDING_KEY)
  } catch {
    return null
  }
  if (!dataUrl) return null
  try {
    const url = await uploadAvatar(supabase, userId, await dataUrlToBlob(dataUrl))
    localStorage.removeItem(PENDING_KEY)
    return url
  } catch {
    return null
  }
}
