'use client'

import SearchBar from '@/components/search/SearchBar'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { UserGroupIcon, InformationCircleIcon, SparklesIcon } from '@heroicons/react/24/outline'

interface NavItemProps {
  href: string
  icon: React.ElementType
  label: string
  isActive: boolean
  sidebarHovered: boolean
  onClick: () => void
}

function NavItem({ href, icon: Icon, label, isActive, sidebarHovered, onClick }: NavItemProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-4 py-3 rounded-lg transition-colors duration-100 group relative h-[40px] ${
        isActive
          ? 'bg-gradient-to-t from-action-100 to-action-200 text-white hover:brightness-130'
          : 'text-text-muted hover:bg-gold-light/20 hover:text-gold-light'
      }`}
    >
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 absolute left-[12px] top-[8px]">
        <Icon className="w-6 h-6 transition-colors text-inherit" />
      </div>
      <span
        className="font-semibold whitespace-nowrap transition-all duration-300 text-inherit"
        style={{
          opacity: sidebarHovered ? 1 : 0,
          marginLeft: '50px',
          paddingTop: '2px',
        }}
      >
        {label}
      </span>
    </Link>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const [optimisticPath, setOptimisticPath] = useState(pathname)
  const isLandingPage = pathname === '/'
  const [sidebarHovered, setSidebarHovered] = useState(false)

  // sync optimistic path with actual path when navigation completes
  useEffect(() => {
    setOptimisticPath(pathname)
  }, [pathname])

  // check if current page is active using optimistic path for instant feedback
  const isChampionsActive = optimisticPath === '/champions'
  const isMayhemActive = optimisticPath === '/mayhem'
  const isAboutActive = optimisticPath?.startsWith('/about')

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
            <Image src="/logo.svg" alt="ARAM PIG Logo" width={32} height={32} className="h-8 w-8 flex-shrink-0" />
            <Image
              src="/title-bar.svg"
              alt="ARAM PIG"
              width={120}
              height={32}
              className="ml-3 h-8 w-auto transition-all duration-300"
              style={{
                opacity: sidebarHovered ? 1 : 0,
                transform: sidebarHovered ? 'translateX(0)' : 'translateX(-20px)',
              }}
            />
          </Link>

          {/* separator */}
          <div className="px-4">
            <div className="h-px bg-gold-light/40" />
          </div>

          {/* nav links */}
          <nav className="flex flex-col gap-2 px-2 py-4">
            <NavItem
              href="/champions"
              icon={UserGroupIcon}
              label="Champions"
              isActive={isChampionsActive}
              sidebarHovered={sidebarHovered}
              onClick={() => setOptimisticPath('/champions')}
            />
            <NavItem
              href="/mayhem"
              icon={SparklesIcon}
              label="Mayhem"
              isActive={isMayhemActive}
              sidebarHovered={sidebarHovered}
              onClick={() => setOptimisticPath('/mayhem')}
            />
            <NavItem
              href="/about"
              icon={InformationCircleIcon}
              label="About"
              isActive={isAboutActive || false}
              sidebarHovered={sidebarHovered}
              onClick={() => setOptimisticPath('/about')}
            />
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
