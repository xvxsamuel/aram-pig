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
  description: 'Track your ARAM stats, analyze your performance, and see detailed match history for League of Legends ARAM games.',
  keywords: ['ARAM', 'League of Legends', 'LoL', 'Stats', 'Match History', 'ARAM Stats', 'League Stats'],
  authors: [{ name: 'ARAM Pig' }],
  themeColor: '#189FC5',
  openGraph: {
    title: 'ARAM Pig - League of Legends ARAM Stats',
    description: 'Track your ARAM stats, analyze your performance, and see detailed match history for League of Legends ARAM games.',
    url: 'https://arampig.lol',
    siteName: 'ARAM Pig',
    images: [
      {
        url: '/og-image.png', // We'll need to create this
        width: 1200,
        height: 630,
        alt: 'ARAM Pig - League of Legends ARAM Stats',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARAM Pig - League of Legends ARAM Stats',
    description: 'Track your ARAM stats, analyze your performance, and see detailed match history.',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    title: 'ARAM Pig',
    capable: true,
    statusBarStyle: 'default'
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${leagueSpartanLight.variable} ${leagueSpartanRegular.variable}`}>
      <body className='min-h-screen antialiased font-light'>
        {children}
      </body>
    </html>
  )
}