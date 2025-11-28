import SearchBar from '@/components/search/SearchBar'
import Image from 'next/image'

export default function HomePage() {
  return (
    <main className="home-page relative min-h-screen flex flex-col items-center px-4 bg-accent-dark overflow-hidden">
      <Image
        src="/bg.png"
        alt="Background"
        fill
        className="object-cover"
        quality={90}
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b backdrop-blur-[3px] from-abyss-400/40 via-abyss-600/60 to-abyss-700/80 pointer-events-none z-0" />
      
      <div className="relative z-10 w-full max-w-2xl flex-1 flex flex-col items-center justify-center gap-[8vh] pb-[35vh]">
        <h1 className="sr-only">ARAM PIG</h1>
        <div className="relative w-full h-[16vw] min-h-[120px] max-h-[400px] ">
          <Image
            src="/title.svg"
            alt="ARAM PIG"
            fill
            className="object-contain select-none"
            draggable={false}
            priority
          />
        </div>
        <SearchBar className="h-12 w-full"/>
      </div>
    </main>
  )
}
