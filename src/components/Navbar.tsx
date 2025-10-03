import SearchBar from "./SearchBar"

export default function Navbar() {
  return (
    <header className="sticky top-0 z-40 bg-accent-darkest border-b border-gold-light/20">
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex gap-6">
          <a href="/" className="flex items-center hover:opacity-80 transition-opacity">
            <img src="/title-bar.svg" alt="ARAM Pig" className="h-12 w-auto" />
          </a>
          <SearchBar className="flex-1 max-w-xl h-10" />
        </div>
      </div>
    </header>
  )
}
