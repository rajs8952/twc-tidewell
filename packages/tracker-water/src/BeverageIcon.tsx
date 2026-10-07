import { Citrus, Coffee, GlassWater, Leaf, Milk, Sparkles, type LucideProps } from 'lucide-react'
import type { BeverageId } from '@omniwell/core/hydration'

const ICONS: Record<BeverageId, React.ComponentType<LucideProps>> = {
  water: GlassWater,
  sparkling: Sparkles,
  tea: Leaf,
  coffee: Coffee,
  juice: Citrus,
  milk: Milk,
}

export function BeverageIcon({ id, ...props }: { id: BeverageId } & LucideProps) {
  const Icon = ICONS[id]
  return <Icon aria-hidden {...props} />
}
