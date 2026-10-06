import { brandIcon } from '@/lib/brand-icon'

/** The manifest's maskable icon: the mark inside the safe zone on a full-bleed background. */
export function GET() {
  return brandIcon(512, { maskable: true })
}
