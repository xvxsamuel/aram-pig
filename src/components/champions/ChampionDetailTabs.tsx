'use client'

import { useMemo } from 'react'
import { OverviewTab, type ComboDisplay, type ComboData } from './tabs/OverviewTab'
import { ItemsTab } from './tabs/ItemsTab'
import { RunesTab } from './tabs/RunesTab'
import { LevelingTab } from './tabs/LevelingTab'
import { calculateWilsonScore } from './tabs/utils'
import type {
  ItemStat,
  RuneStat,
  StatPerkStat,
  AbilityLevelingStat,
  SummonerSpellStat,
  StarterBuild,
  PreCalculatedCombo,
} from '@/types/champion-stats'

interface Props {
  selectedTab: 'overview' | 'items' | 'runes' | 'leveling'
  itemsBySlot: Record<number, ItemStat[]>
  bootsItems: ItemStat[]
  starterItems: StarterBuild[]
  runeStats: Record<number, RuneStat[]>
  statPerks: {
    offense: StatPerkStat[]
    flex: StatPerkStat[]
    defense: StatPerkStat[]
  }
  abilityLevelingStats: AbilityLevelingStat[]
  summonerSpellStats: SummonerSpellStat[]
  ddragonVersion: string
  totalGames: number
  buildOrders: string[]
  allBuildData: PreCalculatedCombo[]
  championWinrate: number
}

export default function ChampionDetailTabs({
  selectedTab,
  itemsBySlot,
  bootsItems,
  starterItems,
  runeStats,
  statPerks,
  abilityLevelingStats,
  summonerSpellStats,
  ddragonVersion,
  totalGames,
  allBuildData,
  championWinrate,
}: Props) {
  // Process build combinations for Overview tab
  const { bestCombinations, worstCombinations, processedComboData } = useMemo(() => {
    const MIN_CORE_GAMES = 50
    
    const combinations: ComboDisplay[] = allBuildData
      .map((combo, idx) => {
        const winrate = combo.winrate ?? (combo.games > 0 ? (combo.wins / combo.games) * 100 : 0)
        const wilsonScore = calculateWilsonScore(combo.games, combo.wins)
        
        return {
          originalIndex: idx,
          itemIds: combo.normalizedItems.filter(id => id !== 99999),
          hasBoots: combo.normalizedItems.includes(99999),
          games: combo.games,
          winrate,
          wilsonScore,
        }
      })
      .filter(c => c.games >= MIN_CORE_GAMES)
      .sort((a, b) => b.wilsonScore - a.wilsonScore)

    const best = combinations.filter(c => c.winrate >= championWinrate).slice(0, 20)
    const worst = combinations
      .filter(c => c.winrate < championWinrate - 2)
      .sort((a, b) => b.games - a.games)
      .slice(0, 20)

    return {
      bestCombinations: best,
      worstCombinations: worst,
      processedComboData: allBuildData as ComboData[],
    }
  }, [allBuildData, championWinrate])

  return (
    <div>
      {/* Tab Content */}
      {selectedTab === 'overview' && (
        <OverviewTab
          bestCombinations={bestCombinations}
          worstCombinations={worstCombinations}
          allComboData={processedComboData}
          ddragonVersion={ddragonVersion}
          runeStats={runeStats}
          statPerks={statPerks}
          starterItems={starterItems}
          summonerSpellStats={summonerSpellStats}
          abilityLevelingStats={abilityLevelingStats}
          totalGames={totalGames}
        />
      )}

      {selectedTab === 'items' && (
        <ItemsTab
          starterItems={starterItems}
          bootsItems={bootsItems}
          itemsBySlot={itemsBySlot}
          ddragonVersion={ddragonVersion}
        />
      )}

      {selectedTab === 'runes' && (
        <RunesTab
          runeStats={runeStats}
          statPerks={statPerks}
          totalGames={totalGames}
        />
      )}

      {selectedTab === 'leveling' && (
        <LevelingTab
          abilityLevelingStats={abilityLevelingStats}
        />
      )}
    </div>
  )
}
