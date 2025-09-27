import type { Metadata } from 'next'
import './globals.css'
import { League_Spartan } from 'next/font/google'

const leagueSpartan = League_Spartan({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'ARAM Pig',
  description: 'ARAM lookup tool',
  appleWebApp: {
    title: 'ARAM Pig',
    capable: true,
    statusBarStyle: 'default'
  }
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  )
}