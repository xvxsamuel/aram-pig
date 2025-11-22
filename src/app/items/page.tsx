import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'Items | ARAM PIG',
  description: 'Browse all League of Legends items.',
}

interface Item {
  id: string
  name: string
  description: string
  plaintext: string
  gold: {
    base: number
    total: number
    sell: number
  }
  itemType?: string
  image?: {
    full: string
  }
}

export default async function ItemsPage() {
  // Load items data
  const itemsDataImport = await import('@/data/items.json')
  const itemsData = itemsDataImport.default as Record<string, Item>
  
  // Filter to only show purchasable items (exclude Ornn items, trinkets, etc)
  const items = Object.entries(itemsData)
    .filter(([_, item]) => {
      // Exclude items with no gold cost
      if (!item.gold?.total || item.gold.total === 0) return false
      
      // Exclude specific categories
      const excludeTypes = ['trinket', 'consumable']
      if (item.itemType && excludeTypes.includes(item.itemType)) return false
      
      return true
    })
    .map(([id, item]) => ({
      ...item,
      id
    }))
    .sort((a, b) => {
      // Sort by type, then by cost
      const typeOrder: Record<string, number> = {
        'mythic': 0,
        'legendary': 1,
        'epic': 2,
        'boots': 3,
        'basic': 4
      }
      const aType = typeOrder[a.itemType || 'basic'] ?? 999
      const bType = typeOrder[b.itemType || 'basic'] ?? 999
      
      if (aType !== bType) return aType - bType
      return b.gold.total - a.gold.total
    })

  return (
    <main className="min-h-screen bg-accent-darker text-white" style={{ marginLeft: '64px' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        <h1 className="text-4xl font-bold mb-8 bg-gradient-to-b from-gold-light to-gold-dark bg-clip-text text-transparent">
          Items
        </h1>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="bg-abyss-600 rounded-lg p-4 hover:bg-abyss-500 transition-colors border border-gold-dark/20 hover:border-accent-light/40"
            >
              <div className="flex flex-col items-center gap-2">
                {/* Item image */}
                <div className="w-16 h-16 relative bg-abyss-700 rounded">
                  {item.image?.full && (
                    <Image
                      src={`https://ddragon.leagueoflegends.com/cdn/14.23.1/img/item/${item.image.full}`}
                      alt={item.name}
                      width={64}
                      height={64}
                      className="rounded"
                    />
                  )}
                </div>
                
                {/* Item name */}
                <h3 className="text-sm font-semibold text-center text-gold-light line-clamp-2 min-h-[2.5rem]">
                  {item.name}
                </h3>
                
                {/* Item type badge */}
                {item.itemType && (
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    item.itemType === 'legendary' ? 'bg-orange-500/20 text-orange-300' :
                    item.itemType === 'epic' ? 'bg-purple-500/20 text-purple-300' :
                    item.itemType === 'boots' ? 'bg-blue-500/20 text-blue-300' :
                    'bg-gray-500/20 text-gray-300'
                  }`}>
                    {item.itemType}
                  </span>
                )}
                
                {/* Item cost */}
                <div className="flex items-center gap-1 text-gold-dark text-sm">
                  <span className="text-xl">⬡</span>
                  <span className="font-semibold">{item.gold.total}</span>
                </div>
                
                {/* Item description */}
                {item.plaintext && (
                  <p className="text-xs text-text-muted text-center line-clamp-2 mt-1">
                    {item.plaintext}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {items.length === 0 && (
          <div className="text-center py-20">
            <p className="text-xl text-text-muted">No items found</p>
          </div>
        )}
      </div>
    </main>
  )
}
