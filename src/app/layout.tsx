import type { Metadata, Viewport } from 'next'
import './globals.css'
import { League_Spartan } from 'next/font/google'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import LoadingBar from '../components/LoadingBar'
import { LoadingProvider } from '../lib/loading-context'

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

export const viewport: Viewport = {
  themeColor: '#189FC5',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://arampig.lol'),
  title: 'ARAM PIG',
  description: 'Track your ARAM stats, analyze your performance, and see detailed match history for League of Legends ARAM games.',
  keywords: ['ARAM', 'League of Legends', 'LoL', 'Stats', 'Match History', 'ARAM Stats', 'League Stats'],
  authors: [{ name: 'ARAM PIG' }],
  openGraph: {
    title: 'ARAM PIG - League of Legends ARAM Stats',
    description: 'Track your ARAM stats, analyze your performance, and see detailed match history for League of Legends ARAM games.',
    url: 'https://arampig.lol',
    siteName: 'ARAM PIG',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ARAM PIG - League of Legends ARAM Stats',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ARAM PIG - League of Legends ARAM Stats',
    description: 'Track your ARAM stats, analyze your performance, and see detailed match history.',
    images: ['/og-image.png'],
  },
  appleWebApp: {
    title: 'ARAM PIG',
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
      <body className='min-h-screen antialiased font-light flex flex-col'>
        <LoadingProvider>
          <Navbar />
          <LoadingBar />
          <main className="flex-1" style={{ marginLeft: '64px' }}>
            {children}
          </main>
          <Footer />
        </LoadingProvider>
      </body>
    </html>
  )
}