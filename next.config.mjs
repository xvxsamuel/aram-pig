/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // disable double-invoke in dev (causes duplicate API calls)
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
}
 
export default nextConfig