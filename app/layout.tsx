import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { TopProgressBar } from '@/components/TopProgressBar'
import { PwaClient } from '@/components/pwa/PwaClient'
import { BRAND } from '@/lib/brand'
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
  title: { default: `${BRAND.name} — ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  appleWebApp: { title: BRAND.name, capable: true, statusBarStyle: 'default' },
  openGraph: { title: BRAND.name, description: BRAND.description, siteName: BRAND.name, type: 'website' },
}

export const viewport: Viewport = {
  themeColor: BRAND.themeColor,
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="min-h-dvh bg-mist font-body text-ink antialiased">
        <TopProgressBar />
        {children}
        <PwaClient />
      </body>
    </html>
  )
}
