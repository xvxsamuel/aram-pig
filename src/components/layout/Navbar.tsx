"use client"

import SearchBar from "@/components/search/SearchBar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { UserGroupIcon, InformationCircleIcon } from '@heroicons/react/24/outline'

export default function Navbar() {
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const [sidebarHovered, setSidebarHovered] = useState(false)
  
  // Check if current page is active
  const isChampionsActive = pathname?.startsWith('/champions')
  const isAboutActive = pathname?.startsWith('/about')
  
  return (
    <>
      {/* sidebar */}
      <aside 
        className="fixed left-0 top-0 min-h-screen h-[120vh] bg-abyss-600 z-50 transition-all duration-300"
        style={{ width: sidebarHovered ? '240px' : '64px' }}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="flex flex-col h-full">
          {/* logo section */}
          <Link href="/" className="flex items-center p-4 h-[64px]">
            <img src="/logo.svg" alt="ARAM PIG Logo" className="h-8 w-8 flex-shrink-0" />
            <img 
              src="/title-bar.svg" 
              alt="ARAM PIG" 
              className="ml-3 h-8 w-auto transition-all duration-300"
              style={{ 
                opacity: sidebarHovered ? 1 : 0,
                transform: sidebarHovered ? 'translateX(0)' : 'translateX(-20px)'
              }}
            />
          </Link>
          
          {/* separator */}
          <div className="px-4">
            <div className="h-px bg-gold-light/40" />
          </div>
          
          {/* nav links */}
          <nav className="flex flex-col gap-2 p-4">
            <Link 
              href="/champions" 
              className={`flex items-center gap-4 py-3 rounded-lg transition-all group relative h-[40px] ${
                isChampionsActive ? 'bg-accent-light/30' : 'hover:bg-accent-light/20'
              }`}
            >
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 absolute left-[4px] top-[8px]">
                <UserGroupIcon className={`w-6 h-6 transition-colors ${
                  isChampionsActive ? 'text-accent-light' : 'text-gold-light group-hover:text-accent-light'
                }`} />
              </div>
              <span 
                className={`font-semibold whitespace-nowrap transition-all duration-300 bg-clip-text text-transparent ${
                  isChampionsActive 
                    ? 'bg-gradient-to-b from-accent-light to-accent-light' 
                    : 'bg-gradient-to-b from-gold-light to-gold-dark group-hover:from-accent-light group-hover:to-accent-light'
                }`}
                style={{ 
                  opacity: sidebarHovered ? 1 : 0,
                  marginLeft: '42px',
                  paddingTop: '2px'
                }}
              >
                Champions
              </span>
            </Link>
            
            <Link 
              href="/about" 
              className={`flex items-center gap-4 py-3 rounded-lg transition-all group relative h-[40px] ${
                isAboutActive ? 'bg-accent-light/30' : 'hover:bg-accent-light/20'
              }`}
            >
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 absolute left-[4px] top-[8px]">
                <InformationCircleIcon className={`w-6 h-6 transition-colors ${
                  isAboutActive ? 'text-accent-light' : 'text-gold-light group-hover:text-accent-light'
                }`} />
              </div>
              <span 
                className={`font-semibold whitespace-nowrap transition-all duration-300 bg-clip-text text-transparent ${
                  isAboutActive 
                    ? 'bg-gradient-to-b from-accent-light to-accent-light' 
                    : 'bg-gradient-to-b from-gold-light to-gold-dark group-hover:from-accent-light group-hover:to-accent-light'
                }`}
                style={{ 
                  opacity: sidebarHovered ? 1 : 0,
                  marginLeft: '42px',
                  paddingTop: '2px'
                }}
              >
                About
              </span>
            </Link>
          </nav>
        </div>
      </aside>
      
      {/* top navbar */}
      {!isLandingPage && (
        <header className="sticky top-0 z-40 bg-abyss-700  border-b border-gold-dark/40" style={{ marginLeft: '64px' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3">
            <div className="flex items-center justify-center h-10">
              <SearchBar className="w-full max-w-md h-10" />
            </div>
          </div>
        </header>
      )}
    </>
  )
}

