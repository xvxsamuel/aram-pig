'use client'

import SearchBar from '@/components/search/SearchBar'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { UserGroupIcon, InformationCircleIcon, Bars3Icon, XMarkIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'

interface NavItemProps {
  href: string
  icon: React.ComponentType<{ className?: string }> | string
  label: string
  isActive: boolean
  onClick: () => void
  labelClassName?: string
  iconClassName?: string
  customActiveClassName?: string
  customInactiveClassName?: string
  isNew?: boolean
  isExpanded?: boolean
}

function NavItem({ 
  href, 
  icon: IconOrPath, 
  label, 
  isActive, 
  onClick, 
  labelClassName, 
  iconClassName, 
  customActiveClassName, 
  customInactiveClassName,
  isNew,
  isExpanded
}: NavItemProps) {
  const isImageIcon = typeof IconOrPath === 'string'
  const activeClass = customActiveClassName || 'bg-gradient-to-t from-action-100 to-action-200 text-white hover:brightness-130'
  const inactiveClass = customInactiveClassName || 'text-text-muted hover:bg-gold-light/20 hover:text-gold-light'

  return (
    <Link
      href={href}
      onClick={onClick}
      data-active={isActive}
      className={`flex items-center gap-4 rounded-lg transition-colors duration-100 group relative h-[40px] overflow-hidden ${
        isActive ? activeClass : inactiveClass
      }`}
    >
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 absolute left-[12px] top-[8px]">
        {isImageIcon ? (
          <Image
            src={IconOrPath as string}
            alt={label}
            width={24}
            height={24}
            className={`w-6 h-6 object-contain transition-all duration-200 ${
              !isActive ? 'opacity-70 grayscale group-hover:grayscale-0 group-hover:opacity-100' : ''
            } ${iconClassName || ''}`}
          />
        ) : (
          <IconOrPath className={`w-6 h-6 transition-colors text-inherit ${iconClassName || ''}`} />
        )}
        
        {/* collapsed state badge */}
        {isNew && !isExpanded && !isActive && (
          <div className="!absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full shadow-md !z-50 transition-opacity duration-300 ease-out group-hover:opacity-0 group-hover:delay-150 cursor-default overflow-hidden">
            <div 
              className="w-full h-full animate-spin" 
              style={{ 
                backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent 60%), conic-gradient(from 0deg, #ff9ff3 0deg, #fd79a8 72deg, #a29bfe 144deg, #74b9ff 216deg, #ffeaa7 288deg, #ff9ff3 360deg)',
                backgroundSize: '100% 100%, 100% 100%',
                animationDuration: '3s',
                filter: 'brightness(1.2)'
              }} 
            />
          </div>
        )}
      </div>
      <div
        className="flex items-center gap-2 whitespace-nowrap pt-[2px]"
        style={{
          marginLeft: '50px',
        }}
      >
        <span className={`font-semibold ${labelClassName || 'text-inherit'}`}>
          {label}
        </span>
        
        {/* expanded state badge */}
        {isNew && !isActive && (
          <span className={`inline-flex items-center justify-center px-1.5 rounded text-[10px] bg-holographic-badge uppercase tracking-wider transition-opacity duration-200 ${isExpanded ? 'opacity-100' : 'opacity-0'} flex-shrink-0 leading-none h-[18px] -translate-y-[1px]`}>
            New!
          </span>
        )}
      </div>
    </Link>
  )
}

export default function Navbar() {
  const pathname = usePathname()
  const [optimisticPath, setOptimisticPath] = useState(pathname)
  const isLandingPage = pathname === '/'
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [openedViaSearch, setOpenedViaSearch] = useState(false)

  // sync optimistic path with actual path when navigation completes
  useEffect(() => {
    setOptimisticPath(pathname)
    setIsMobileMenuOpen(false) // close mobile menu on navigation
  }, [pathname])

  // check if current page is active using optimistic path for instant feedback
  const isChampionsActive = optimisticPath === '/champions'
  const isMayhemActive = optimisticPath === '/mayhem'
  const isAboutActive = optimisticPath?.startsWith('/about')

  // prevent scrolling when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
      // auto-focus search bar if opened via magnifying glass
      if (openedViaSearch) {
        setTimeout(() => {
          searchInputRef.current?.focus()
          setOpenedViaSearch(false)
        }, 100)
      }
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isMobileMenuOpen, openedViaSearch])

  const navLinks = [
    {
      href: '/champions',
      icon: UserGroupIcon,
      label: 'Champions',
      isActive: isChampionsActive,
      onClick: () => setOptimisticPath('/champions'),
    },
    {
      href: '/mayhem',
      icon: '/icons/augments/eureka.png',
      label: 'Mayhem',
      isActive: isMayhemActive,
      onClick: () => setOptimisticPath('/mayhem'),
      labelClassName: "animate-holographic font-bold tracking-wide",
      iconClassName: "scale-[1.35]",
      customActiveClassName: "bg-holographic-active hover:brightness-125 transition-colors",
      customInactiveClassName: "text-text-muted bg-holographic-hover",
      isNew: true,
    },
    {
      href: '/about',
      icon: InformationCircleIcon,
      label: 'About',
      isActive: isAboutActive || false,
      onClick: () => setOptimisticPath('/about'),
    }
  ]

  const mobileNavLinks = navLinks.map(link => ({
    ...link,
    onClick: () => {
      link.onClick()
      setIsMobileMenuOpen(false)
    }
  }))

  return (
    <>
      {/* desktop sidebar */}
      <aside
        className="hidden md:block fixed left-0 top-0 min-h-screen h-[120vh] bg-abyss-600 z-50 transition-all duration-300 overflow-hidden"
        style={{ width: sidebarHovered ? '240px' : '64px' }}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <div className="flex flex-col h-full">
          {/* logo section */}
          <Link href="/" className="flex items-center p-4 h-[64px] overflow-hidden">
            <Image src="/logo.svg" alt="ARAM PIG Logo" width={32} height={32} className="h-8 w-8 flex-shrink-0" />
            <Image
              src="/title-bar.svg"
              alt="ARAM PIG"
              width={120}
              height={32}
              className="ml-3 h-8 w-auto flex-shrink-0 transition-opacity duration-300"
              style={{ opacity: sidebarHovered ? 1 : 0 }}
            />
          </Link>

          {/* separator */}
          <div className="px-4">
            <div className="h-px bg-gold-light/40" />
          </div>

          {/* nav links */}
          <nav className="flex flex-col gap-2 px-2 py-4">
            {navLinks.map((link) => (
              <NavItem
                key={link.href}
                {...link}
                isExpanded={sidebarHovered}
              />
            ))}
          </nav>
        </div>
      </aside>

      {/* mobile top bar */}
      <header 
        className={`md:hidden sticky top-0 z-[60] h-16 border-b px-4 flex items-center gap-4 transition-colors duration-300 ${
          isLandingPage 
            ? 'bg-transparent border-transparent' 
            : 'bg-abyss-700 border-gold-dark/40'
        } ${isLandingPage && isMobileMenuOpen ? '!bg-abyss-700' : ''}`}
      >
         <div className="flex items-center gap-3 flex-shrink-0">
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="text-text-muted hover:text-white transition-colors"
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? (
                <XMarkIcon className="w-8 h-8" />
              ) : (
                <Bars3Icon className="w-8 h-8" />
              )}
            </button>
            <Link href="/" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center">
              <Image src="/logo.svg" alt="ARAM PIG Logo" width={32} height={32} className="h-8 w-8" />
            </Link>
         </div>

         <div className="flex-1" />

         <button 
           onClick={() => {
             setOpenedViaSearch(true)
             setIsMobileMenuOpen(true)
           }}
           className="text-text-muted hover:text-white transition-colors"
           aria-label="Open search"
         >
           <MagnifyingGlassIcon className="w-7 h-7" />
         </button>
      </header>

      {/* mobile fullscreen menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 z-[59] bg-abyss-600/95 backdrop-blur-md overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-4 pb-2 relative z-10">
            <SearchBar className="w-full h-12" inputRef={searchInputRef} />
          </div>
          <nav className="flex flex-col p-4 pt-2 gap-2">
            {mobileNavLinks.map((link) => (
              <NavItem
                key={link.href}
                {...link}
                isExpanded={true}
              />
            ))}
          </nav>
        </div>
      )}

      {/* desktop top navbar */}
      {!isLandingPage && (
        <div 
          className="hidden md:block sticky top-0 z-40 bg-abyss-700 border-b border-gold-dark/40 transition-all duration-300 ml-[64px]"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3">
            <div className="flex items-center justify-center h-10">
              <SearchBar className="w-full max-w-md h-10" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

