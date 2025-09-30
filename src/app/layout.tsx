import type { Metadata } from 'next'
import './globals.css'
import { League_Spartan } from 'next/font/google'

const leagueSpartanLight = League_Spartan({
  subsets: ['latin'],
  weight: '300',
  display: 'swap',
  variable: '--font-light',
})

const leagueSpartanRegular = League_Spartan({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-regular',
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
    <html lang="en" className={`${leagueSpartanLight.variable} ${leagueSpartanRegular.variable}`}>
      <body className="min-h-screen antialiased font-light">
        {children}
      </body>
    </html>
  )
}