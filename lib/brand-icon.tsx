import { ImageResponse } from 'next/og'
import { PILLAR_COLORS, PILLAR_ORDER } from './brand'

/**
 * The OmniWell mark as a PNG (for favicons, the home-screen icon and the
 * manifest): six pillar petals on a soft background. Drawn with plain
 * positioned circles because ImageResponse supports only a subset of CSS.
 */
export function brandIcon(size: number, { maskable = false }: { maskable?: boolean } = {}) {
  const s = size
  // Maskable icons get cropped to the device's shape (circle, squircle…), so the
  // mark is shrunk into the central 80% "safe zone" on a full-bleed background.
  const scale = maskable ? 0.72 : 1
  const petal = s * 0.36 * scale
  const ring = s * 0.19 * scale
  return new ImageResponse(
    (
      <div
        style={{
          width: s,
          height: s,
          display: 'flex',
          position: 'relative',
          background: '#F6F9F8',
          borderRadius: maskable ? 0 : s * 0.22,
        }}
      >
        {PILLAR_ORDER.map((k, i) => {
          const a = (i / PILLAR_ORDER.length) * Math.PI * 2 - Math.PI / 2
          return (
            <div
              key={k}
              style={{
                position: 'absolute',
                width: petal,
                height: petal,
                left: s / 2 + Math.cos(a) * ring - petal / 2,
                top: s / 2 + Math.sin(a) * ring - petal / 2,
                borderRadius: petal,
                background: PILLAR_COLORS[k],
                opacity: 0.8,
              }}
            />
          )
        })}
        <div
          style={{
            position: 'absolute',
            width: s * 0.15 * scale,
            height: s * 0.15 * scale,
            left: s / 2 - (s * 0.15 * scale) / 2,
            top: s / 2 - (s * 0.15 * scale) / 2,
            borderRadius: s,
            background: '#FFFFFF',
          }}
        />
      </div>
    ),
    { width: s, height: s },
  )
}
