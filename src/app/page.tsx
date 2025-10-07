import SearchBar from '../components/SearchBar'
import Image from 'next/image'

export default function HomePage() {
  return (
    <main className="relative min-h-screen flex flex-col items-center px-4 bg-accent-dark overflow-hidden">
      <Image
        src="/bg.png"
        alt="Background"
        fill
        className="object-cover"
        quality={90}
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-accent-dark/65 pointer-events-none z-0" />
      
      <div className="relative z-10 w-full max-w-2xl flex-1 flex flex-col items-center justify-center gap-8 pb-[20vh]">
        <h1 className="sr-only">ARAM PIG</h1>
        <div className="relative w-full h-[16vw] min-h-[80px] max-h-[200px]">
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

      <div className="relative z-10 text-subtitle text-center text-sm pb-6 px-4 max-w-4xl">
        <p className="mb-2">Built by keve with ❤</p>
        <p className="text-xs opacity-70">
          ARAM PIG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc. League of Legends © Riot Games, Inc.
        </p>
      </div>
    </main>
  )
}