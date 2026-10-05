import { brandIcon } from '@/lib/brand-icon'

export const contentType = 'image/png'

/** Favicon plus the manifest's home-screen sizes: /icon/32, /icon/192, /icon/512. */
export function generateImageMetadata() {
  return [32, 192, 512].map((n) => ({ id: String(n), size: { width: n, height: n }, contentType }))
}

export default function Icon({ id }: { id: string }) {
  return brandIcon(Number(id))
}
