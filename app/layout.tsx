import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'

// Self-hosted from @fontsource-variable so builds don't need to reach Google Fonts.
const display = localFont({
  src: '../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2',
  weight: '200 800',
  variable: '--font-display',
  display: 'swap',
})
const body = localFont({
  src: '../node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2',
  weight: '200 1000',
  variable: '--font-body',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tidewell — daily water tracker',
  description: 'A personal daily water goal, a glass that fills as you drink, and streaks that keep you going.',
}

export const viewport: Viewport = {
  themeColor: '#EDF4F3',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-mist font-body text-ink antialiased">{children}</body>
    </html>
  )
}
