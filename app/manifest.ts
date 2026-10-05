import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

/** Web app manifest: lets OmniWell be installed to a phone's home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/dashboard',
    display: 'standalone',
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.themeColor,
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
