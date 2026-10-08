'use client'

import { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_MAX_SIDE } from './messages'

/* ------------------------------------------------------------------
 * Preparing a chat photo in the browser before upload: images only,
 * scaled to at most CHAT_IMAGE_MAX_SIDE on the longest side and re-encoded
 * (WebP, or JPEG where WebP isn't supported). Re-encoding also drops
 * hidden metadata such as the GPS location phones embed in photos.
 * The server checks the result again (app/actions/chat-media.ts).
 * ------------------------------------------------------------------ */

export class ChatImageError extends Error {}

/** Formats people pick that we can decode and re-encode; everything else is refused up front. */
function looksLikeImage(file: File) {
  if (file.type.startsWith('image/')) return file.type !== 'image/svg+xml' // SVG can carry scripts
  // Some phones leave the type blank for HEIC; let decoding decide.
  return file.type === '' && /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  /** A local preview URL; revoke it when done. */
  previewUrl: string
}

export async function prepareChatImage(file: File): Promise<PreparedImage> {
  if (!looksLikeImage(file)) throw new ChatImageError('Only images can be shared. Videos, PDFs and other files aren’t allowed.')
  if (file.size > 40 * 1024 * 1024) throw new ChatImageError('That image is too large to send.')

  let bitmap: ImageBitmap
  try {
    // Respect the photo's rotation (EXIF orientation) while decoding.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ChatImageError('This image format can’t be opened here. Try a JPEG or PNG (on iPhone: Settings → Camera → Formats → Most Compatible).')
  }

  const scale = Math.min(1, CHAT_IMAGE_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ChatImageError('Your browser can’t process images.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // WebP first; browsers that can't encode it fall back to PNG silently, so check and use JPEG instead.
  let blob: Blob | null = null
  for (const quality of [0.82, 0.7, 0.55]) {
    blob = await toBlob(canvas, 'image/webp', quality)
    if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', quality)
    if (blob && blob.size <= CHAT_IMAGE_MAX_BYTES) break
  }
  if (!blob) throw new ChatImageError('Couldn’t prepare that image. Try another one.')
  if (blob.size > CHAT_IMAGE_MAX_BYTES) throw new ChatImageError('That image is too large even after shrinking. Try a smaller one.')
  return { blob, width, height, previewUrl: URL.createObjectURL(blob) }
}
