/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
        pathname: '/**',
      },
    ],
    qualities: [75, 90, 100],
    unoptimized: true,
  },
}
 
export default nextConfig