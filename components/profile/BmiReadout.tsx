import { bmi, bmiBand } from '@/lib/biometrics'

/* BMI bands on a 15–35 scale: under 18.5, 18.5–25, 25–30, 30+. */
const BANDS = [
  { from: 15, to: 18.5, className: 'bg-sky-200' },
  { from: 18.5, to: 25, className: 'bg-emerald-300' },
  { from: 25, to: 30, className: 'bg-amber-200' },
  { from: 30, to: 35, className: 'bg-orange-300' },
]
const TICKS = [15, 18.5, 25, 30, 35]

/** BMI from height and weight, with a simple band bar. Prompts for height when it's missing. */
export function BmiReadout({ heightCm, weightKg }: { heightCm: number | null; weightKg: number }) {
  const value = bmi(heightCm, weightKg)

  if (value == null) {
    return (
      <div className="rounded-2xl bg-mist/70 px-4 py-3 text-sm text-muted ring-1 ring-line">
        Add your height to see your BMI.
      </div>
    )
  }

  const band = bmiBand(value)
  return (
    <div className="rounded-2xl bg-mist/70 p-4 ring-1 ring-line" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">Body-mass index</p>
        <p className="font-display text-2xl font-extrabold tabular-nums">{value.toFixed(1)}</p>
      </div>
      <p className="text-sm font-semibold text-ink">{band.label}</p>

      <div className="relative mt-3" aria-hidden>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
          {BANDS.map((b) => (
            <span key={b.from} className={b.className} style={{ flex: b.to - b.from }} />
          ))}
        </div>
        <span
          className="absolute top-1 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-white"
          style={{ left: `${band.position * 100}%` }}
        />
        <div className="relative mt-1.5 h-4 text-[11px] font-semibold text-muted">
          {TICKS.map((t, i) => (
            <span
              key={t}
              className={`absolute ${i === 0 ? '' : i === TICKS.length - 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${((t - 15) / 20) * 100}%` }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs text-muted">
        A rough guide for adults: it doesn’t account for muscle, build or age. Talk to the dietitian for a proper check.
      </p>
    </div>
  )
}
