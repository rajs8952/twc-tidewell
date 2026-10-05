/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Water Stats and Garden moved inside the Water section; keep old links and bookmarks working.
  async redirects() {
    return [
      { source: '/stats', destination: '/water/stats', permanent: true },
      { source: '/garden', destination: '/water/garden', permanent: true },
    ]
  },
}

export default nextConfig
