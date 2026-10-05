import { ImageResponse } from 'next/og'
import { PILLAR_COLORS, PILLAR_ORDER } from './brand'

/**
 * The OmniWell mark as a PNG (for favicons, the home-screen icon and the
 * manifest): six pillar petals on a soft background. Drawn with plain
 * positioned circles because ImageResponse supports only a subset of CSS.
 */
export function brandIcon(size: number) {
  const s = size
  const petal = s * 0.36
  const ring = s * 0.19
  return new ImageResponse(
    (
      <div
        style={{
          width: s,
          height: s,
          display: 'flex',
          position: 'relative',
          background: '#F6F9F8',
          borderRadius: s * 0.22,
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
            width: s * 0.15,
            height: s * 0.15,
            left: s * 0.425,
            top: s * 0.425,
            borderRadius: s,
            background: '#FFFFFF',
          }}
        />
      </div>
    ),
    { width: s, height: s },
  )
}
