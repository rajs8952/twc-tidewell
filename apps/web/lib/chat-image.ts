'use client'

import { CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_MAX_SIDE, CHAT_IMAGE_TARGET_BYTES } from './messages'

/* ------------------------------------------------------------------
 * Preparing a chat photo in the browser before upload: images only,
 * compressed towards CHAT_IMAGE_TARGET_BYTES (about 300 KB):
 *   1. at most CHAT_IMAGE_MAX_SIDE px, quality 0.8 → 0.7 → 0.6
 *   2. if still too big, smaller sizes (1280, then 1024 px) at 0.7 / 0.6
 * Encoded as WebP (JPEG where WebP isn't supported). Re-encoding also
 * drops hidden metadata such as the GPS location phones embed in photos.
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

/** WebP, falling back to JPEG where the browser can't encode WebP (it would silently give PNG). */
async function encode(canvas: HTMLCanvasElement, quality: number) {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp && webp.type === 'image/webp') return webp
  return toBlob(canvas, 'image/jpeg', quality)
}

/** Each step tried in turn until the image fits the target size. */
const STEPS: { side: number; quality: number }[] = [
  { side: CHAT_IMAGE_MAX_SIDE, quality: 0.8 },
  { side: CHAT_IMAGE_MAX_SIDE, quality: 0.7 },
  { side: CHAT_IMAGE_MAX_SIDE, quality: 0.6 },
  { side: 1280, quality: 0.7 },
  { side: 1280, quality: 0.6 },
  { side: 1024, quality: 0.6 },
]

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
  /** The picked file's size, to show how much was saved. */
  originalBytes: number
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

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new ChatImageError('Your browser can’t process images.')
  }

  let best: { blob: Blob; width: number; height: number } | null = null
  try {
    for (const step of STEPS) {
      const scale = Math.min(1, step.side / Math.max(bitmap.width, bitmap.height))
      const width = Math.max(1, Math.round(bitmap.width * scale))
      const height = Math.max(1, Math.round(bitmap.height * scale))
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bitmap, 0, 0, width, height)
      }
      const blob = await encode(canvas, step.quality)
      if (!blob) continue
      if (!best || blob.size < best.blob.size) best = { blob, width, height }
      if (blob.size <= CHAT_IMAGE_TARGET_BYTES) break
      // A small original needs no further squeezing.
      if (scale === 1 && file.size <= CHAT_IMAGE_TARGET_BYTES) break
    }
  } finally {
    bitmap.close()
  }

  if (!best) throw new ChatImageError('Couldn’t prepare that image. Try another one.')
  if (best.blob.size > CHAT_IMAGE_MAX_BYTES) throw new ChatImageError('That image is too large even after compressing. Try a smaller one.')
  return { ...best, originalBytes: file.size, previewUrl: URL.createObjectURL(best.blob) }
}

/** "4.2 MB", "210 KB". */
export function formatBytes(n: number) {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`
}
