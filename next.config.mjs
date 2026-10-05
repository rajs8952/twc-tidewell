/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

export default nextConfig
