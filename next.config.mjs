/** @type {import('next').NextConfig} */
const nextConfig = {
  // Removed output: 'export' to allow dynamic routes
  // This means the app needs to be deployed on a server that supports Node.js
  // (like Vercel, Netlify, or any Node.js hosting)
  distDir: './dist', // Changes the build output directory to `./dist/`.
}
 
export default nextConfig