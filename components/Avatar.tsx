function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function Avatar({ src, name, size = 40 }: { src: string | null; name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-tide-100 font-display font-bold text-tide-700 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  )
}
