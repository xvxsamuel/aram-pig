"use client"

import SearchBar from "./SearchBar"
import Link from "next/link"
import { usePathname } from "next/navigation"

export default function Navbar() {
  const pathname = usePathname()
  
  // hide navbar on landing page
  if (pathname === '/') {
    return null
  }
  
  return (
    <header className="sticky top-0 z-40 bg-accent-darkest border-b border-gold-light/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-3 sm:py-4">
        <div className="flex place-content-between items-center gap-2 sm:gap-4">
          <Link href="/" className="flex items-center hover:opacity-80 transition-opacity flex-shrink-0">
            <img src="/title-bar.svg" alt="ARAM PIG" className="hidden sm:block h-10 sm:h-12 w-auto" />
            <img src="/logo.svg" alt="ARAM PIG Logo" className="block sm:hidden h-10 w-auto" />
          </Link>
          <SearchBar className="flex-1 max-w-md h-10 sm:h-10" />
          <nav className="flex">
            <Link 
              href="/about" 
              className="nav-link font-semibold"
            >
              <h6>About</h6>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
