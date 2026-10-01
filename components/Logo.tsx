export function Logo({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
        <path d="M12 2.5C12 2.5 4.5 10.6 4.5 15a7.5 7.5 0 0 0 15 0C19.5 10.6 12 2.5 12 2.5Z" fill={light ? '#fff' : '#2189D6'} />
        <path d="M7.6 15.4c1.4-1 2.9-1 4.4 0s3 1 4.4 0" stroke={light ? '#1A6DB5' : '#fff'} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
      <span className={light ? 'text-white' : 'text-ink'}>Tidewell</span>
    </span>
  )
}
