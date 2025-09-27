import SearchBar from '../components/SearchBar'

export default function HomePage() {
  return (
    <main
      className="relative min-h-screen flex pb-[12vw] flex-col items-center justify-center gap-8 px-4
                 bg-cover bg-center bg-[url('/bg.png')] 
                 before:content-[''] before:absolute before:inset-0 before:bg-gradient-to-b
                 before:from-black/40 before:to-accent-dark/65 before:backdrop-blur-xs
                 before:pointer-events-none before:z-0"
    >
      <div className="relative z-10 w-full flex flex-col items-center gap-8">
        <h1 className="sr-only">ARAM Pig</h1>
        <img src="/title.svg" alt="ARAM Pig" className="h-[12vw] w-auto select-none" draggable="false" />
        <SearchBar className="h-16 min-w-2xl"/>
      </div>
    </main>
  )
}