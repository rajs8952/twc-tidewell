import withSerwistInit from '@serwist/next'

/**
 * Service worker (PWA): built from app/sw.ts into public/sw.js for production
 * builds only; it would fight hot reloading in `next dev`.
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // Don't reload the page when the connection comes back: it would wipe a half-written entry or message.
  reloadOnOnline: false,
  // The offline page is saved at install time, versioned per deploy.
  additionalPrecacheEntries: [{ url: '/~offline', revision: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()) }],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Chat images go through a server action (app/actions/chat-media.ts). The browser shrinks
    // photos first; 4 MB leaves headroom under Vercel's 4.5 MB request limit (the default is 1 MB).
    serverActions: { bodySizeLimit: '4mb' },
  },
  // Workspace packages ship TypeScript source; Next compiles them with the app.
  transpilePackages: [
    '@rajs8952/core',
    '@rajs8952/interventions',
    '@rajs8952/storage',
    '@rajs8952/ui',
    '@rajs8952/tracker-bmi',
    '@rajs8952/tracker-exercise',
    '@rajs8952/tracker-meditation',
    '@rajs8952/tracker-mood',
    '@rajs8952/tracker-sleep',
    '@rajs8952/tracker-water',
    '@rajs8952/tracker-weight',
    '@rajs8952/trackers',
  ],
  async headers() {
    return [
      {
        // The browser must always fetch the newest service worker, or updates stall.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ]
  },
  async redirects() {
    return [
      // The app moved from tidewell-lime.vercel.app to omniwell-app.vercel.app.
      // Same path and query on the new address (listed first so it wins).
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'tidewell-lime.vercel.app' }],
        destination: 'https://omniwell-app.vercel.app/:path*',
        permanent: true,
      },
      // Water Stats and Garden moved inside the Water section; keep old links and bookmarks working.
      { source: '/stats', destination: '/water/stats', permanent: true },
      { source: '/garden', destination: '/water/garden', permanent: true },
    ]
  },
}

export default withSerwist(nextConfig)
