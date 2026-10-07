import type { MetadataRoute } from 'next'
import { BRAND } from '@/lib/brand'

/** Web app manifest: lets OmniWell be installed to a phone's home screen (with app/sw.ts). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/dashboard',
    name: BRAND.name,
    short_name: BRAND.name,
    description: BRAND.description,
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: BRAND.backgroundColor,
    theme_color: BRAND.themeColor,
    categories: ['health', 'lifestyle', 'fitness'],
    icons: [
      { src: '/icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the home-screen icon for these.
    shortcuts: [
      { name: 'Log water', url: '/water', icons: [{ src: '/icon/192', sizes: '192x192' }] },
      { name: 'Check in on your mood', short_name: 'Mood', url: '/mood', icons: [{ src: '/icon/192', sizes: '192x192' }] },
      { name: 'Talk to Therapist', short_name: 'Therapist', url: '/messages/therapist', icons: [{ src: '/icon/192', sizes: '192x192' }] },
    ],
  }
}
