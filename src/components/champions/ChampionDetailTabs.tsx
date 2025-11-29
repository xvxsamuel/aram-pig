'use client'

import { useState } from 'react'
import Image from 'next/image'
import clsx from 'clsx'
import Tooltip from '@/components/ui/Tooltip'
import { getItemImageUrl, getSummonerSpellUrl } from '@/lib/api/ddragon'
import { getWinrateColor } from '@/lib/ui'
import runesData from '@/data/runes.json'

// rune tree structure - organized by tree, keystone, and tier
const RUNE_TREES = {
  precision: {
    id: 8000,
    name: 'Precision',
    color: '#C8AA6E',
    keystones: [8005, 8008, 8021, 8010], // Press the Attack, Lethal Tempo, Fleet Footwork, Conqueror
    tier1: [9101, 8009, 9111], // Absorb Life, Presence of Mind, Triumph
    tier2: [9104, 9103, 9105], // Legend: Alacrity, Legend: Bloodline, Legend: Haste
    tier3: [8014, 8017, 8299], // Coup de Grace, Cut Down, Last Stand
  },
  domination: {
    id: 8100,
    name: 'Domination',
    color: '#D44242',
    keystones: [8112, 8128, 9923, 8124], // Electrocute, Dark Harvest, Hail of Blades
    tier1: [8126, 8139, 8143], // Cheap Shot, Taste of Blood, Sudden Impact
    tier2: [8136, 8120, 8138], // Zombie Ward, Ghost Poro, Eyeball Collection
    tier3: [8135, 8105, 8106], // Treasure Hunter, Relentless Hunter, Ultimate Hunter
  },
  sorcery: {
    id: 8200,
    name: 'Sorcery',
    color: '#9FAAFC',
    keystones: [8214, 8229, 8230], // Summon Aery, Arcane Comet, Phase Rush
    tier1: [8224, 8226, 8275], // Nullifying Orb, Manaflow Band, Nimbus Cloak
    tier2: [8210, 8234, 8233], // Transcendence, Celerity, Absolute Focus
    tier3: [8237, 8232, 8236], // Scorch, Waterwalking, Gathering Storm
  },
  resolve: {
    id: 8400,
    name: 'Resolve',
    color: '#A1D586',
    keystones: [8437, 8439, 8465], // Grasp of the Undying, Aftershock, Guardian
    tier1: [8446, 8463, 8401], // Demolish, Font of Life, Shield Bash
    tier2: [8429, 8444, 8473], // Conditioning, Second Wind, Bone Plating
    tier3: [8451, 8453, 8242], // Overgrowth, Revitalize, Unflinching
  },
  inspiration: {
    id: 8300,
    name: 'Inspiration',
    color: '#49AAF5',
    keystones: [8351, 8360, 8369], // Glacial Augment, Unsealed Spellbook, First Strike
    tier1: [8306, 8304, 8313], // Hextech Flashtraption, Magical Footwear, Triple Tonic
    tier2: [8321, 8345, 8347], // Cash Back, Biscuit Delivery, Cosmic Insight
    tier3: [8410, 8352, 8316], // Approach Velocity, Time Warp Tonic, Jack Of All Trades
  },
}

// get rune tree info by rune ID
function getRuneTree(runeId: number): { tree: typeof RUNE_TREES.precision; tier: 'keystone' | 'tier1' | 'tier2' | 'tier3' | null } | null {
  for (const tree of Object.values(RUNE_TREES)) {
    if (tree.keystones.includes(runeId)) return { tree, tier: 'keystone' }
    if (tree.tier1.includes(runeId)) return { tree, tier: 'tier1' }
    if (tree.tier2.includes(runeId)) return { tree, tier: 'tier2' }
    if (tree.tier3.includes(runeId)) return { tree, tier: 'tier3' }
  }
  return null
}

// "qew" -> "Q > E > W"
function getAbilityMaxOrder(abilityOrder: string): string {
  if (!abilityOrder || abilityOrder.trim() === '') return 'Q > W > E'
  
  // if it's already a short format like "qew", "qwe", etc., just format it
  const cleaned = abilityOrder.toLowerCase().replace(/[^qwe]/g, '')
  
  if (cleaned.length <= 3) {
    // short format: "qew" -> "Q > E > W"
    const abilities = cleaned.split('').map(c => c.toUpperCase())
    
    // ensure we have all 3 abilities
    if (abilities.length < 3) {
      const missing = ['Q', 'W', 'E'].filter(a => !abilities.includes(a))
      abilities.push(...missing)
    }
    
    return abilities.slice(0, 3).join(' > ')
  }
  
  // if it's a long format like "Q W E Q W R Q W Q W R W W E E R E E", parse it
  const parts = abilityOrder.split(' ')
  const counts = { Q: 0, W: 0, E: 0, R: 0 }
  const maxOrder: string[] = []
  
  for (const ability of parts) {
    if (ability in counts) {
      counts[ability as keyof typeof counts]++
      if (ability !== 'R' && counts[ability as keyof typeof counts] === 5) {
        maxOrder.push(ability)
      }
    }
  }
  
  // normalize incomplete orders
  if (maxOrder.length === 0) {
    const sorted = (['Q', 'W', 'E'] as ('Q' | 'W' | 'E')[]).sort((a, b) => counts[b] - counts[a])
    return sorted.join(' > ')
  }
  if (maxOrder.length === 1) {
    const remaining = ['Q', 'W', 'E'].filter(a => !maxOrder.includes(a))
    remaining.sort((a, b) => counts[b as keyof typeof counts] - counts[a as keyof typeof counts])
    return `${maxOrder[0]} > ${remaining[0]} > ${remaining[1]}`
  }
  if (maxOrder.length === 2) {
    const missing = ['Q', 'W', 'E'].find(a => !maxOrder.includes(a))
    return `${maxOrder[0]} > ${maxOrder[1]} > ${missing}`
  }
  
  return maxOrder.join(' > ')
}

interface ItemStat {
  item_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface StarterBuild {
  starter_build: string // Comma-separated item IDs
  items: number[] // Array of item IDs
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface RuneStat {
  rune_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface AbilityLevelingStat {
  ability_order: string
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface SummonerSpellStat {
  spell1_id: number
  spell2_id: number
  games: number
  wins: number
  winrate: number
  pickrate: number
}

interface PreCalculatedCombo {
  normalizedItems: number[]
  actualBoots: number[]
  games: number
  wins: number
  itemStats: Record<number, { 
    positions: Record<number, { games: number; wins: number }>
  }>
  runes?: {
    primary?: Record<string, { games: number; wins: number }>
    secondary?: Record<string, { games: number; wins: number }>
    tertiary?: {
      offense?: Record<string, { games: number; wins: number }>
      flex?: Record<string, { games: number; wins: number }>
      defense?: Record<string, { games: number; wins: number }>
    }
  }
  spells?: Record<string, { games: number; wins: number }>
  starting?: Record<string, { games: number; wins: number }>
}

interface Props {
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  starterItems: StarterBuild[]
  runeStats: Record<number, RuneStat[]>
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  totalGames: number
  buildOrders: string[]
  allBuildData: PreCalculatedCombo[]
}

export default function ChampionDetailTabs({ itemsBySlot, bootsItems, starterItems, runeStats, abilityLevelingStats, summonerSpellStats, ddragonVersion, totalGames, allBuildData }: Props) {
  const [selectedTab, setSelectedTab] = useState<'overview' | 'items' | 'runes' | 'leveling'>('overview')
  const [selectedCombo, setSelectedCombo] = useState<number>(0)

  console.log('ChampionDetailTabs: allBuildData length:', allBuildData?.length, 'selectedCombo:', selectedCombo)

  // transform pre-calculated combinations into display format with build order and accompanying items
  const itemCombinations = (() => {
    if (!allBuildData || allBuildData.length === 0) {
      return []
    }
    
    console.log('[DEBUG] Starting itemCombinations transformation, allBuildData:', allBuildData.length)
    console.log('[DEBUG] First combo normalizedItems:', allBuildData[0]?.normalizedItems)
    console.log('[DEBUG] itemsBySlot keys:', Object.keys(itemsBySlot))
    
    const combinations = allBuildData
      .map((combo, idx) => {
        // derive build order from position data: for each combo item, find which slot it appears in most
        const buildOrder: Array<{ itemId: number; preferredSlot: number; games: number }> = []
        
        combo.normalizedItems.forEach(itemId => {
          const itemStats = combo.itemStats[itemId]
          if (!itemStats || !itemStats.positions) {
            // fallback: no position data, just use order from combo key
            buildOrder.push({ itemId, preferredSlot: buildOrder.length + 1, games: 0 })
            return
          }
          
          // find which slot this item appears in most frequently
          let maxSlot = 1
          let maxGames = 0
          Object.entries(itemStats.positions).forEach(([slot, stats]) => {
            if (stats.games > maxGames) {
              maxGames = stats.games
              maxSlot = parseInt(slot)
            }
          })
          
          buildOrder.push({ itemId, preferredSlot: maxSlot, games: maxGames })
        })
        
        // sort by preferred slot to get purchase order
        buildOrder.sort((a, b) => a.preferredSlot - b.preferredSlot)
        
        // create item stats in the derived build order
        const itemStats = buildOrder.map(({ itemId }) => {
          if (itemId === 99999) {
            // boots placeholder: aggregate all actual boot items
            const totalBootsGames = bootsItems.reduce((sum, b) => sum + b.games, 0)
            const totalBootsWins = bootsItems.reduce((sum, b) => sum + b.wins, 0)
            return {
              item_id: 99999,
              games: totalBootsGames,
              wins: totalBootsWins,
              winrate: totalBootsGames > 0 ? (totalBootsWins / totalBootsGames) * 100 : 0,
              pickrate: totalGames > 0 ? (totalBootsGames / totalGames) * 100 : 0
            }
          }
          
          for (const slotItems of Object.values(itemsBySlot)) {
            const found = slotItems.find(i => i.item_id === itemId)
            if (found) return found
          }
          if (idx === 0) {
            console.log('[DEBUG] Could not find item in itemsBySlot:', itemId)
          }
          return null
        }).filter(Boolean) as ItemStat[]
        
        if (itemStats.length !== combo.normalizedItems.length) {
          if (idx === 0) {
            console.log('[DEBUG] Skipping combo, itemStats length:', itemStats.length, 'normalizedItems length:', combo.normalizedItems.length)
          }
          return null
        }
        
        // get actual boot items with their stats
        const actualBootItems = combo.actualBoots
          .map(bootId => bootsItems.find(b => b.item_id === bootId))
          .filter(Boolean) as ItemStat[]
        
        // derive accompanying items: items that appear in slots not occupied by the combo
        const comboSlots = new Set(buildOrder.map(b => b.preferredSlot))
        const accompanyingItems: Array<{ item_id: number; slot: number; games: number; wins: number }> = []
        
        // look at all items in the combo's itemStats to find non-combo items
        Object.entries(combo.itemStats).forEach(([itemIdStr, itemData]) => {
          const itemId = parseInt(itemIdStr)
          
          // skip if this item is part of the combo
          if (combo.normalizedItems.includes(itemId)) return
          
          // for non-combo items, find which slot they appear in most
          if (itemData.positions) {
            Object.entries(itemData.positions).forEach(([slot, stats]) => {
              const slotNum = parseInt(slot)
              // only include items in slots not occupied by combo items
              if (!comboSlots.has(slotNum)) {
                accompanyingItems.push({
                  item_id: itemId,
                  slot: slotNum,
                  games: stats.games,
                  wins: stats.wins
                })
              }
            })
          }
        })
        
        // sort accompanying items by frequency
        accompanyingItems.sort((a, b) => b.games - a.games)
        
        const avgWinrate = combo.games > 0 ? (combo.wins / combo.games) * 100 : 0
        const pickrate = totalGames > 0 ? (combo.games / totalGames) * 100 : 0
        
        if (idx === 0) {
          console.log('[DEBUG] Created combo with games:', combo.games, 'avgWinrate:', avgWinrate, 'buildOrder:', buildOrder.map(b => b.itemId), 'accompanying:', accompanyingItems.length)
        }
        
        return {
          items: itemStats,
          hasBoots: combo.normalizedItems.includes(99999),
          actualBootItems: actualBootItems,
          estimatedGames: combo.games,
          avgWinrate,
          buildOrder: buildOrder.map(b => b.preferredSlot),
          accompanyingItems: accompanyingItems.slice(0, 10), // top 10 accompanying items
          pickrate
        }
      })
      .filter(Boolean) as Array<{
        items: ItemStat[]
        hasBoots: boolean
        actualBootItems: ItemStat[]
        estimatedGames: number
        avgWinrate: number
        buildOrder: number[]
        accompanyingItems: Array<{ item_id: number; slot: number; games: number; wins: number }>
        pickrate: number
      }>
    
    console.log('[DEBUG] After mapping, combinations length:', combinations.length)
    console.log('[DEBUG] First combo estimatedGames:', combinations[0]?.estimatedGames)
    
    // sort by games and take top 5 with at least 2 games
    return combinations
      .filter(c => c.estimatedGames >= 2)
      .sort((a, b) => b.estimatedGames - a.estimatedGames)
      .slice(0, 5)
  })()

  return (
    <div>
      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-gold-dark/40">
        <button
          onClick={() => setSelectedTab('overview')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'overview'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Overview
        </button>
        <button
          onClick={() => setSelectedTab('items')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'items'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Items
        </button>
        <button
          onClick={() => setSelectedTab('runes')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'runes'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Runes
        </button>
        <button
          onClick={() => setSelectedTab('leveling')}
          className={clsx(
            'px-6 py-2 font-semibold transition-all border-b-2',
            selectedTab === 'leveling'
              ? 'border-accent-light text-white'
              : 'border-transparent text-text-muted hover:text-white'
          )}
        >
          Leveling Order
        </button>
      </div>

      {/* Overview Tab */}
      {selectedTab === 'overview' && (
      <div className="grid grid-cols-12 gap-6">
        {/* Left Sidebar - Item Combinations */}
        <div className="col-span-12 lg:col-span-3 xl:col-span-3">
          <div className="bg-abyss-700 rounded-lg p-4 sticky top-4">
            <div className="text-sm text-subtitle mb-3">Select a combination</div>
            <div className="space-y-2">
              {itemCombinations.map((combo, idx) => (
                <div
                  key={idx}
                  className={clsx(
                    'rounded-lg transition-all',
                    selectedCombo === idx
                      ? 'p-px bg-gradient-to-b from-gold-light to-gold-dark'
                      : ''
                  )}
                >
                  <button
                    onClick={() => setSelectedCombo(idx)}
                    className={clsx(
                      'w-full text-left p-3 rounded-lg transition-colors',
                      selectedCombo === idx
                        ? 'bg-abyss-700'
                        : 'bg-abyss-800 hover:bg-abyss-900'
                    )}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {/* Show non-boot items */}
                      {combo.items.filter(item => item.item_id !== 99999).map((item, position) => (
                        <div key={position} className="flex items-center gap-1">
                          {position > 0 && <span className="text-gray-600 text-xs">+</span>}
                          <Tooltip id={item.item_id} type="item">
                            <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 overflow-hidden flex-shrink-0">
                              <Image
                                src={getItemImageUrl(item.item_id, ddragonVersion)}
                                alt=""
                                width={32}
                                height={32}
                                className="w-full h-full object-cover"
                                unoptimized
                              />
                            </div>
                          </Tooltip>
                        </div>
                      ))}
                      
                      {/* Show "Any Boots" placeholder if combo includes boots */}
                      {combo.hasBoots && (
                        <>
                          <span className="text-gray-600 text-xs">+</span>
                          <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">Any<br/>Boots</span>
                          </div>
                        </>
                      )}
                      
                      {/* Show "No Boots" if explicitly marked */}
                    {combo.items.some(item => item.item_id === -2) && (
                      <>
                        <span className="text-gray-600 text-xs">+</span>
                        <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] text-gray-400 text-center leading-tight px-0.5">No<br/>Boots</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex justify-between text-xs">
                    <span className="font-bold" style={{ color: getWinrateColor(combo.avgWinrate) }}>
                      {combo.avgWinrate.toFixed(1)}%
                    </span>
                    <span className="text-subtitle">{Math.round(combo.estimatedGames).toLocaleString()}</span>
                  </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="col-span-12 lg:col-span-9 xl:col-span-9 space-y-6">
          {/* Items Section with Rune Tree - shows build order when combo selected */}
          <div className="bg-abyss-700 rounded-lg p-6">
            <div className="flex flex-col lg:flex-row gap-6">
              {/* Items Grid */}
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-4">Items</h3>
                {itemCombinations[selectedCombo] ? (
                  <div>
                    <div className="text-sm text-subtitle mb-6">
                      Showing most common items built in each slot with this combination ({itemCombinations[selectedCombo].estimatedGames.toLocaleString()} games)
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((slotNum) => {
                    const _slotIdx = slotNum - 1
                    
                    // get combo object to access all itemStats with positions
                    const combo = allBuildData[selectedCombo]
                    const itemsInSlot: Array<{ itemId: number; games: number; winrate: number }> = []
                    
                    // iterate through ALL items in the combo's itemStats (not just the 3 core items)
                    if (combo?.itemStats) {
                      Object.entries(combo.itemStats).forEach(([itemIdStr, itemData]) => {
                        const itemId = parseInt(itemIdStr)
                        
                        // check if this item appears in this slot
                        if (itemData.positions?.[slotNum]) {
                          const posData = itemData.positions[slotNum]
                          itemsInSlot.push({
                            itemId: itemId,
                            games: posData.games,
                            winrate: posData.games > 0 ? (posData.wins / posData.games) * 100 : 0
                          })
                        }
                      })
                    }
                    
                    // sort by games and take top 3
                    itemsInSlot.sort((a, b) => b.games - a.games)
                    const top3 = itemsInSlot.slice(0, 3)
                    
                    return (
                      <div key={slotNum}>
                        <div className="text-center text-xl font-bold mb-3 text-white">
                          {slotNum}
                        </div>
                        <div className="space-y-2">
                          {top3.length > 0 ? (
                            top3.map((itemData, idx) => (
                              <div key={idx} className="text-center mb-1">
                                <Tooltip id={itemData.itemId} type="item">
                                  <div className="w-12 h-12 mx-auto rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                                    <Image
                                      src={getItemImageUrl(itemData.itemId, ddragonVersion)}
                                      alt=""
                                      width={48}
                                      height={48}
                                      className="w-full h-full object-cover"
                                      unoptimized
                                    />
                                  </div>
                                </Tooltip>
                                <div className="text-xs font-bold" style={{ color: getWinrateColor(itemData.winrate) }}>
                                  {itemData.winrate.toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted">{itemData.games.toLocaleString()}</div>
                              </div>
                            ))
                          ) : (
                            <div className="text-center text-xs text-gray-600 py-2">
                              No items
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </div>
              ) : (
                <div className="text-center text-subtitle py-12">
                  No item combinations available
                </div>
              )}
            </div>
          </div>
        </div>

          {/* Runes Section - Full rune page based on best keystone */}
          <div className="bg-abyss-700 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-4">Runes</h3>
            {(() => {
              // Get all runes
              const allRunes: RuneStat[] = []
              Object.values(runeStats).forEach(slotRunes => {
                slotRunes.forEach(rune => {
                  if (!allRunes.find(r => r.rune_id === rune.rune_id)) {
                    allRunes.push(rune)
                  }
                })
              })
              
              // Calculate total games for pickrate baseline
              const totalGames = Math.max(...allRunes.filter(r => getRuneTree(r.rune_id)?.tier === 'keystone').map(r => r.games), 1)
              
              // Score function: balances winrate and pickrate
              // Higher winrate is better, but very low pickrate penalizes
              // Formula: winrate * log(pickrate * 100 + 1) / log(101)
              // This makes a 75% wr with 4x less pickrate need significantly higher wr to beat 60% wr majority pick
              const calculateScore = (rune: RuneStat) => {
                const pickrate = (rune.games / totalGames) * 100
                // Require at least 2% pickrate to be considered
                if (pickrate < 2) return 0
                // Score = winrate * pickrate_factor
                // pickrate_factor ranges from ~0.3 (2% pick) to 1.0 (100% pick)
                const pickrateFactor = Math.log10(pickrate + 1) / Math.log10(101)
                return rune.winrate * (0.5 + pickrateFactor * 0.5)
              }
              
              // Find best keystone by score
              const keystones = allRunes.filter(r => getRuneTree(r.rune_id)?.tier === 'keystone')
              const bestKeystone = keystones.sort((a, b) => calculateScore(b) - calculateScore(a))[0]
              
              if (!bestKeystone) return <div className="text-center text-subtitle py-4">No rune data available</div>
              
              const primaryTreeInfo = getRuneTree(bestKeystone.rune_id)
              if (!primaryTreeInfo) return null
              
              // Get best rune for each tier in the primary tree
              const primaryTreeName = primaryTreeInfo.tree.name.toLowerCase()
              const getBestRuneForTier = (tier: 'tier1' | 'tier2' | 'tier3') => {
                const tierRunes = allRunes.filter(r => {
                  const info = getRuneTree(r.rune_id)
                  return info?.tree.name.toLowerCase() === primaryTreeName && info?.tier === tier
                })
                return tierRunes.sort((a, b) => calculateScore(b) - calculateScore(a))[0]
              }
              
              const bestTier1 = getBestRuneForTier('tier1')
              const bestTier2 = getBestRuneForTier('tier2')
              const bestTier3 = getBestRuneForTier('tier3')
              
              // Find best secondary tree (not primary)
              const secondaryTreeRunes = allRunes.filter(r => {
                const info = getRuneTree(r.rune_id)
                return info && info.tree.name.toLowerCase() !== primaryTreeName && info.tier !== 'keystone'
              })
              
              // Group by tree and find which tree has highest total score
              const treeScores: Record<string, number> = {}
              secondaryTreeRunes.forEach(rune => {
                const info = getRuneTree(rune.rune_id)
                if (!info) return
                const treeName = info.tree.name.toLowerCase()
                treeScores[treeName] = (treeScores[treeName] || 0) + calculateScore(rune)
              })
              
              const bestSecondaryTreeName = Object.entries(treeScores).sort((a, b) => b[1] - a[1])[0]?.[0]
              const bestSecondaryTree = bestSecondaryTreeName ? RUNE_TREES[bestSecondaryTreeName as keyof typeof RUNE_TREES] : null
              
              // Get top 2 runes from secondary tree
              const secondaryRunes = secondaryTreeRunes
                .filter(r => getRuneTree(r.rune_id)?.tree.name.toLowerCase() === bestSecondaryTreeName)
                .sort((a, b) => calculateScore(b) - calculateScore(a))
                .slice(0, 2)
              
              const primaryTree = primaryTreeInfo.tree
              const primaryTreeIcon = (runesData as Record<string, any>)[primaryTree.id]?.icon
              const keystoneInfo = (runesData as Record<string, any>)[bestKeystone.rune_id.toString()]
              
              return (
                <div className="flex flex-col lg:flex-row gap-8">
                  {/* Primary Tree */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      {primaryTreeIcon && (
                        <div className="w-8 h-8 rounded overflow-hidden">
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/img/${primaryTreeIcon}`}
                            alt=""
                            width={32}
                            height={32}
                            className="w-full h-full"
                            unoptimized
                          />
                        </div>
                      )}
                      <span className="text-lg font-bold" style={{ color: primaryTree.color }}>{primaryTree.name}</span>
                      <span className="text-xs text-subtitle">Primary</span>
                    </div>
                    
                    <div className="flex flex-col items-center gap-3">
                      {/* Keystone */}
                      <div className="flex items-center gap-3">
                        <Tooltip id={bestKeystone.rune_id} type="rune">
                          <div className="w-14 h-14 rounded-full bg-abyss-900 border-2 border-gold-dark overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                            {keystoneInfo?.icon && (
                              <Image
                                src={`https://ddragon.leagueoflegends.com/cdn/img/${keystoneInfo.icon}`}
                                alt=""
                                width={56}
                                height={56}
                                className="w-full h-full"
                                unoptimized
                              />
                            )}
                          </div>
                        </Tooltip>
                        <div className="text-sm">
                          <div className="font-bold" style={{ color: getWinrateColor(bestKeystone.winrate) }}>
                            {bestKeystone.winrate.toFixed(1)}%
                          </div>
                          <div className="text-[10px] text-muted">{bestKeystone.games.toLocaleString()}</div>
                        </div>
                      </div>
                      
                      {/* Tier Runes */}
                      {[bestTier1, bestTier2, bestTier3].map((rune, idx) => {
                        if (!rune) return null
                        const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <Tooltip id={rune.rune_id} type="rune">
                              <div className="w-10 h-10 rounded-full bg-abyss-900 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                                {runeInfo?.icon && (
                                  <Image
                                    src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                    alt=""
                                    width={40}
                                    height={40}
                                    className="w-full h-full"
                                    unoptimized
                                  />
                                )}
                              </div>
                            </Tooltip>
                            <div className="text-xs">
                              <div className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                                {rune.winrate.toFixed(1)}%
                              </div>
                              <div className="text-[10px] text-muted">{rune.games.toLocaleString()}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  
                  {/* Secondary Tree */}
                  {bestSecondaryTree && secondaryRunes.length > 0 && (
                    <div className="flex-1 border-t lg:border-t-0 lg:border-l border-gray-700 pt-4 lg:pt-0 lg:pl-8">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded overflow-hidden">
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/img/${(runesData as Record<string, any>)[bestSecondaryTree.id]?.icon}`}
                            alt=""
                            width={32}
                            height={32}
                            className="w-full h-full"
                            unoptimized
                          />
                        </div>
                        <span className="text-lg font-bold" style={{ color: bestSecondaryTree.color }}>{bestSecondaryTree.name}</span>
                        <span className="text-xs text-subtitle">Secondary</span>
                      </div>
                      
                      <div className="flex flex-col items-center gap-3">
                        {secondaryRunes.map((rune, idx) => {
                          const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                          return (
                            <div key={idx} className="flex items-center gap-3">
                              <Tooltip id={rune.rune_id} type="rune">
                                <div className="w-10 h-10 rounded-full bg-abyss-900 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                                  {runeInfo?.icon && (
                                    <Image
                                      src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                      alt=""
                                      width={40}
                                      height={40}
                                      className="w-full h-full"
                                      unoptimized
                                    />
                                  )}
                                </div>
                              </Tooltip>
                              <div className="text-xs">
                                <div className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                                  {rune.winrate.toFixed(1)}%
                                </div>
                                <div className="text-[10px] text-muted">{rune.games.toLocaleString()}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* Starting Items, Spells, Level Order Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Starting Items */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Starting Items</h4>
              {starterItems.length > 0 ? (
                <div>
                  <div className="flex gap-2 mb-2 text-sm">
                    <div className="text-white font-bold" style={{ color: getWinrateColor(starterItems[0].winrate) }}>
                      {starterItems[0].winrate.toFixed(1)}%
                    </div>
                    <div className="text-subtitle">{starterItems[0].games.toLocaleString()}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {starterItems[0].items.map((itemId, itemIdx) => (
                      <Tooltip key={itemIdx} id={itemId} type="item">
                        <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                          <Image
                            src={getItemImageUrl(itemId, ddragonVersion)}
                            alt=""
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                            unoptimized
                          />
                        </div>
                      </Tooltip>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">No data</div>
              )}
            </div>

            {/* Summoner Spells */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Spells</h4>
              {summonerSpellStats.length > 0 ? (
                <div>
                  <div className="flex gap-2 mb-2 text-sm">
                    <div className="text-white font-bold" style={{ color: getWinrateColor(summonerSpellStats[0].winrate) }}>
                      {summonerSpellStats[0].winrate.toFixed(1)}%
                    </div>
                    <div className="text-subtitle">{summonerSpellStats[0].games.toLocaleString()}</div>
                  </div>
                  <div className="flex gap-2">
                    <Tooltip id={summonerSpellStats[0].spell1_id} type="summoner-spell">
                      <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                        <Image
                          src={getSummonerSpellUrl(summonerSpellStats[0].spell1_id, ddragonVersion)}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                    <Tooltip id={summonerSpellStats[0].spell2_id} type="summoner-spell">
                      <div className="w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                        <Image
                          src={getSummonerSpellUrl(summonerSpellStats[0].spell2_id, ddragonVersion)}
                          alt=""
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                          unoptimized
                        />
                      </div>
                    </Tooltip>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500">No data</div>
              )}
            </div>

            {/* Level Order */}
            <div className="bg-abyss-700 rounded-lg p-4">
              <h4 className="font-bold mb-3 text-gold-light">Skill Max Order</h4>
              {abilityLevelingStats.length > 0 && (
                <div>
                  <div className="flex gap-2 mb-3 text-sm">
                    <div className="text-white font-bold" style={{ color: getWinrateColor(abilityLevelingStats[0].winrate) }}>
                      {abilityLevelingStats[0].winrate.toFixed(1)}%
                    </div>
                    <div className="text-subtitle">{abilityLevelingStats[0].games.toLocaleString()}</div>
                  </div>
                  {/* Max Order Display */}
                  <div className="flex items-center gap-2">
                    {getAbilityMaxOrder(abilityLevelingStats[0].ability_order).split(' > ').map((ability, idx, arr) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-10 h-10 flex items-center justify-center rounded-lg font-bold text-lg bg-abyss-800 border border-gray-600 text-white">
                          {ability}
                        </div>
                        {idx < arr.length - 1 && (
                          <span className="text-gray-500 font-bold">&gt;</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Runes Grid - Organized by Tree */}
          <div className="bg-abyss-700 rounded-lg p-6">
            <h3 className="text-2xl font-bold mb-6">Runes</h3>
            {(() => {
              // Collect all runes from all slots into a single array
              const allRunes: RuneStat[] = []
              Object.values(runeStats).forEach(slotRunes => {
                slotRunes.forEach(rune => {
                  if (!allRunes.find(r => r.rune_id === rune.rune_id)) {
                    allRunes.push(rune)
                  }
                })
              })
              
              // Organize runes by tree
              const runesByTree: Record<string, { keystones: RuneStat[], tier1: RuneStat[], tier2: RuneStat[], tier3: RuneStat[] }> = {}
              
              allRunes.forEach(rune => {
                const treeInfo = getRuneTree(rune.rune_id)
                if (!treeInfo) return
                
                const treeName = treeInfo.tree.name.toLowerCase()
                if (!runesByTree[treeName]) {
                  runesByTree[treeName] = { keystones: [], tier1: [], tier2: [], tier3: [] }
                }
                
                if (treeInfo.tier === 'keystone') runesByTree[treeName].keystones.push(rune)
                else if (treeInfo.tier === 'tier1') runesByTree[treeName].tier1.push(rune)
                else if (treeInfo.tier === 'tier2') runesByTree[treeName].tier2.push(rune)
                else if (treeInfo.tier === 'tier3') runesByTree[treeName].tier3.push(rune)
              })
              
              // Sort each tier by games
              Object.values(runesByTree).forEach(tree => {
                tree.keystones.sort((a, b) => b.games - a.games)
                tree.tier1.sort((a, b) => b.games - a.games)
                tree.tier2.sort((a, b) => b.games - a.games)
                tree.tier3.sort((a, b) => b.games - a.games)
              })
              
              // Get top keystone to determine primary tree
              const topKeystone = allRunes
                .filter(r => getRuneTree(r.rune_id)?.tier === 'keystone')
                .sort((a, b) => b.games - a.games)[0]
              
              const primaryTreeName = topKeystone ? getRuneTree(topKeystone.rune_id)?.tree.name.toLowerCase() : null
              
              return (
                <div className="space-y-6">
                  {/* Primary Tree - Most played keystones */}
                  {primaryTreeName && runesByTree[primaryTreeName] && (
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 rounded overflow-hidden">
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/img/${(runesData as Record<string, any>)[RUNE_TREES[primaryTreeName as keyof typeof RUNE_TREES].id]?.icon}`}
                            alt=""
                            width={24}
                            height={24}
                            className="w-full h-full"
                            unoptimized
                          />
                        </div>
                        <span className="font-bold text-lg" style={{ color: RUNE_TREES[primaryTreeName as keyof typeof RUNE_TREES].color }}>
                          {RUNE_TREES[primaryTreeName as keyof typeof RUNE_TREES].name}
                        </span>
                        <span className="text-xs text-subtitle ml-2">Primary</span>
                      </div>
                      
                      {/* Keystones */}
                      {runesByTree[primaryTreeName].keystones.length > 0 && (
                        <div className="mb-4">
                          <div className="text-xs text-subtitle mb-2 uppercase tracking-wider">Keystone</div>
                          <div className="flex flex-wrap gap-3">
                            {runesByTree[primaryTreeName].keystones.slice(0, 4).map((rune) => {
                              const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                              return (
                                <div key={rune.rune_id} className="flex items-center gap-2 bg-abyss-800 rounded-lg p-2 pr-4">
                                  <Tooltip id={rune.rune_id} type="rune">
                                    <div className="w-10 h-10 rounded-full bg-abyss-900 border-2 border-gold-dark overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                                      {runeInfo?.icon && (
                                        <Image
                                          src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                          alt=""
                                          width={40}
                                          height={40}
                                          className="w-full h-full"
                                          unoptimized
                                        />
                                      )}
                                    </div>
                                  </Tooltip>
                                  <div className="text-xs">
                                    <div className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                                      {rune.winrate.toFixed(1)}%
                                    </div>
                                    <div className="text-subtitle">{rune.pickrate.toFixed(0)}% pick</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Tier Runes - Vertical display */}
                      <div className="flex flex-col gap-3">
                        {['tier1', 'tier2', 'tier3'].map((tierKey) => {
                          const tierRunes = runesByTree[primaryTreeName][tierKey as keyof typeof runesByTree[typeof primaryTreeName]]
                          if (tierRunes.length === 0) return null
                          return (
                            <div key={tierKey} className="flex items-center gap-3">
                              {tierRunes.slice(0, 3).map((rune, _idx) => {
                                const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                                return (
                                  <div key={rune.rune_id} className="flex items-center gap-2">
                                    <Tooltip id={rune.rune_id} type="rune">
                                      <div className="w-10 h-10 rounded-full bg-abyss-900 border border-gray-700 overflow-hidden hover:border-accent-light transition-colors cursor-pointer">
                                        {runeInfo?.icon && (
                                          <Image
                                            src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                            alt=""
                                            width={40}
                                            height={40}
                                            className="w-full h-full"
                                            unoptimized
                                          />
                                        )}
                                      </div>
                                    </Tooltip>
                                    <div className="text-[10px] min-w-0">
                                      <div className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>
                                        {rune.winrate.toFixed(0)}%
                                      </div>
                                      <div className="text-subtitle">{rune.pickrate.toFixed(0)}%</div>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      </div>
      )}

      {/* Items Tab */}
      {selectedTab === 'items' && (
        <div className="space-y-6">
          {/* Starter Items Section */}
          {starterItems.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-3">Starter Items</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {starterItems.slice(0, 10).map((build, idx) => {
                  // Group duplicate items and count them
                  const itemCounts = new Map<number, number>()
                  build.items.forEach(itemId => {
                    itemCounts.set(itemId, (itemCounts.get(itemId) || 0) + 1)
                  })
                  
                  return (
                    <div key={idx} className="bg-abyss-700 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {Array.from(itemCounts.entries()).map(([itemId, count], itemIdx) => (
                            <Tooltip key={itemIdx} id={itemId} type="item">
                              <div className="relative w-10 h-10 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                                <Image
                                  src={getItemImageUrl(itemId, ddragonVersion)}
                                  alt="Item"
                                  width={40}
                                  height={40}
                                  className="w-full h-full object-cover"
                                  unoptimized
                                />
                                {count > 1 && (
                                  <div className="absolute bottom-0 right-0 bg-abyss-900 border border-gray-700 rounded-tl px-1 text-[10px] font-bold text-white leading-tight">
                                    {count}
                                  </div>
                                )}
                              </div>
                            </Tooltip>
                          ))}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-subtitle">Pick</span>
                            <span className="font-bold">{build.pickrate.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-subtitle">Win</span>
                            <span className="font-bold" style={{ color: getWinrateColor(build.winrate) }}>
                              {build.winrate.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Boots Section */}
          {bootsItems.length > 0 && (
            <div>
              <h3 className="text-xl font-bold mb-3">Boots</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {bootsItems.map((item) => (
                  <div key={item.item_id} className="bg-abyss-700 rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {item.item_id === -1 || item.item_id === -2 ? (
                        <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-2xl text-gray-500">∅</span>
                        </div>
                      ) : (
                        <Tooltip id={item.item_id} type="item">
                          <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                            <Image
                              src={getItemImageUrl(item.item_id, ddragonVersion)}
                              alt="Item"
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-subtitle">Pick</span>
                          <span className="font-bold">{item.pickrate.toFixed(1)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-subtitle">Win</span>
                          <span className="font-bold" style={{ color: getWinrateColor(item.winrate) }}>
                            {item.winrate.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Item Slots */}
          {[0, 1, 2, 3, 4, 5].map((slot) => {
            const items = itemsBySlot[slot]
            if (!items || items.length === 0) return null

            return (
              <div key={slot}>
                <h3 className="text-xl font-bold mb-3">
                  {slot === 0 ? 'Slot 1' : `Slot ${slot + 1}`}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {items.slice(0, 8).map((item) => (
                    <div key={item.item_id} className="bg-abyss-700 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <Tooltip id={item.item_id} type="item">
                          <div className="w-12 h-12 rounded bg-abyss-800 border border-gray-700 overflow-hidden flex-shrink-0">
                            <Image
                              src={getItemImageUrl(item.item_id, ddragonVersion)}
                              alt="Item"
                              width={48}
                              height={48}
                              className="w-full h-full object-cover"
                              unoptimized
                            />
                          </div>
                        </Tooltip>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-subtitle">Pick</span>
                            <span className="font-bold">{item.pickrate.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-subtitle">Win</span>
                            <span className="font-bold" style={{ color: getWinrateColor(item.winrate) }}>
                              {item.winrate.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Runes Tab */}
      {selectedTab === 'runes' && (
        <div>
          {(() => {
            // Collect all runes from all slots
            const allRunes: RuneStat[] = []
            Object.values(runeStats).forEach(slotRunes => {
              slotRunes.forEach(rune => {
                if (!allRunes.find(r => r.rune_id === rune.rune_id)) {
                  allRunes.push(rune)
                }
              })
            })
            
            // Organize by tree
            const runesByTree: Record<string, { tree: typeof RUNE_TREES.precision, keystones: RuneStat[], tier1: RuneStat[], tier2: RuneStat[], tier3: RuneStat[] }> = {}
            
            allRunes.forEach(rune => {
              const treeInfo = getRuneTree(rune.rune_id)
              if (!treeInfo) return
              
              const treeName = treeInfo.tree.name.toLowerCase()
              if (!runesByTree[treeName]) {
                runesByTree[treeName] = { tree: treeInfo.tree, keystones: [], tier1: [], tier2: [], tier3: [] }
              }
              
              if (treeInfo.tier === 'keystone') runesByTree[treeName].keystones.push(rune)
              else if (treeInfo.tier === 'tier1') runesByTree[treeName].tier1.push(rune)
              else if (treeInfo.tier === 'tier2') runesByTree[treeName].tier2.push(rune)
              else if (treeInfo.tier === 'tier3') runesByTree[treeName].tier3.push(rune)
            })
            
            // Sort each tier by games
            Object.values(runesByTree).forEach(tree => {
              tree.keystones.sort((a, b) => b.games - a.games)
              tree.tier1.sort((a, b) => b.games - a.games)
              tree.tier2.sort((a, b) => b.games - a.games)
              tree.tier3.sort((a, b) => b.games - a.games)
            })
            
            // Fixed tree order: Precision, Domination, Sorcery, Resolve, Inspiration
            const treeOrder = ['precision', 'domination', 'sorcery', 'resolve', 'inspiration']
            
            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {treeOrder.map(treeName => {
                  const treeData = runesByTree[treeName]
                  const tree = RUNE_TREES[treeName as keyof typeof RUNE_TREES]
                  if (!tree) return null
                  
                  const { keystones = [], tier1 = [], tier2 = [], tier3 = [] } = treeData || {}
                  
                  return (
                    <div key={treeName} className="bg-abyss-700 rounded-lg p-3">
                      {/* Tree Header */}
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
                        <div className="w-6 h-6 rounded overflow-hidden">
                          <Image
                            src={`https://ddragon.leagueoflegends.com/cdn/img/${(runesData as Record<string, any>)[tree.id]?.icon}`}
                            alt=""
                            width={24}
                            height={24}
                            className="w-full h-full"
                            unoptimized
                          />
                        </div>
                        <span className="text-sm font-bold" style={{ color: tree.color }}>{tree.name}</span>
                      </div>
                      
                      {/* Keystones Row */}
                      <div className="mb-3">
                        <div className="flex flex-wrap justify-center gap-2">
                          {keystones.map((rune) => {
                            const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                            return (
                              <Tooltip key={rune.rune_id} id={rune.rune_id} type="rune">
                                <div className="flex flex-col items-center cursor-pointer group">
                                  <div className="w-10 h-10 rounded-full bg-abyss-900 border-2 border-gold-dark overflow-hidden group-hover:border-accent-light transition-colors">
                                    {runeInfo?.icon && (
                                      <Image
                                        src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                        alt=""
                                        width={40}
                                        height={40}
                                        className="w-full h-full"
                                        unoptimized
                                      />
                                    )}
                                  </div>
                                  <div className="text-[10px] text-center mt-1">
                                    <span className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>{rune.winrate.toFixed(1)}%</span>
                                    <span className="text-subtitle ml-1">{rune.games.toLocaleString()}</span>
                                  </div>
                                </div>
                              </Tooltip>
                            )
                          })}
                          {keystones.length === 0 && (
                            <div className="text-[10px] text-subtitle">No data</div>
                          )}
                        </div>
                      </div>
                      
                      {/* Tier Runes */}
                      {[tier1, tier2, tier3].map((tierRunes, tierIdx) => (
                        <div key={tierIdx} className="mb-2 last:mb-0">
                          <div className="flex flex-wrap justify-center gap-2">
                            {tierRunes.map((rune) => {
                              const runeInfo = (runesData as Record<string, any>)[rune.rune_id.toString()]
                              return (
                                <Tooltip key={rune.rune_id} id={rune.rune_id} type="rune">
                                  <div className="flex flex-col items-center cursor-pointer group">
                                    <div className="w-8 h-8 rounded bg-abyss-900 border border-gray-700 overflow-hidden group-hover:border-accent-light transition-colors">
                                      {runeInfo?.icon && (
                                        <Image
                                          src={`https://ddragon.leagueoflegends.com/cdn/img/${runeInfo.icon}`}
                                          alt=""
                                          width={32}
                                          height={32}
                                          className="w-full h-full"
                                          unoptimized
                                        />
                                      )}
                                    </div>
                                    <div className="text-[9px] text-center mt-0.5">
                                      <span className="font-bold" style={{ color: getWinrateColor(rune.winrate) }}>{rune.winrate.toFixed(1)}%</span>
                                      <span className="text-subtitle ml-1">{rune.games.toLocaleString()}</span>
                                    </div>
                                  </div>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {Object.keys(runeStats).length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No rune data available
            </div>
          )}
        </div>
      )}

      {/* Leveling Order Tab */}
      {selectedTab === 'leveling' && (
        <div className="space-y-4">
          {abilityLevelingStats.length > 0 ? (
            <>
              <div className="text-sm text-gray-400 mb-4">
                Most popular skill max orders
              </div>
              {abilityLevelingStats.map((stat, idx) => {
                const maxOrder = getAbilityMaxOrder(stat.ability_order)
                return (
                  <div key={idx} className="bg-abyss-700 rounded-lg p-4">
                    {/* Max Order Display */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        {maxOrder.split(' > ').map((ability, abilityIdx, arr) => (
                          <div key={abilityIdx} className="flex items-center gap-2">
                            <div className="w-12 h-12 flex items-center justify-center rounded-lg font-bold text-xl bg-abyss-800 border border-gray-600 text-white">
                              {ability}
                            </div>
                            {abilityIdx < arr.length - 1 && (
                              <span className="text-gray-500 font-bold text-lg">&gt;</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-4 text-sm ml-auto">
                        <span className="text-subtitle">Pick: <span className="font-bold text-white">{stat.pickrate.toFixed(1)}%</span></span>
                        <span className="text-subtitle">Win: <span className="font-bold" style={{ color: getWinrateColor(stat.winrate) }}>{stat.winrate.toFixed(1)}%</span></span>
                        <span className="text-subtitle">Games: <span className="font-bold text-white">{stat.games.toLocaleString()}</span></span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="text-center text-gray-400 py-8">
              No leveling order data available yet. Data is collected from recent profile updates.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
