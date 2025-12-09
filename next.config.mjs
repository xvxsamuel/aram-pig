/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // disable double-invoke in dev (causes duplicate api calls)
  images: {
    qualities: [75, 90],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
        pathname: '/**',
      },
    ],
  },
  // Suppress source map warnings from Next.js internal files
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.ignoreWarnings = [
        { module: /node_modules\/next\/dist/ }
      ]
    }
    return config
  },
}

export default nextConfig
