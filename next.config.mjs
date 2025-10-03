/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: './dist',
  
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
        pathname: '/**',
      },
    ],
    unoptimized: true,
  },
}
 
export default nextConfig