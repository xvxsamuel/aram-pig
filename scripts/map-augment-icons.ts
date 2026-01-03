// Map augment names to icon files
// Usage: npx tsx scripts/map-augment-icons.ts

import * as fs from 'fs'
import * as path from 'path'
import augments from '../src/data/augments.json'

const ICONS_DIR = path.join(__dirname, '../public/icons/augments')
const AUGMENTS_PATH = path.join(__dirname, '../src/data/augments.json')

// Get all available icons
const iconFiles = fs.readdirSync(ICONS_DIR)
  .filter(f => f.endsWith('.png'))
  .map(f => f.replace('.png', ''))

// Manual mappings for known mismatches
const MANUAL_MAPPINGS: Record<string, string> = {
  "ADAPt": "adapt",
  "Adamant": "adamant",
  "Escape Plan": "escapeplan",
  "Hat on a Hat": "hatonahat",
  "Frost Wraith": "frostwraith",
  "Light 'em Up!": "lightemup",
  "Don't Blink": "dontblink",
  "First-Aid Kit": "firstaidkit",
  "Tank Engine": "tank_engine",
  "Pandora's Box": "pandoras_box",
  "Quest: Urf's Champion": "quest_urfschampion",
  "Quest: Wooglet's Witchcap": "quest_woogletswitchcap",
  "Quest: Sneakerhead": "sneakerhead",
  "Can't Touch This": "canttouchthis",
  "It's Critical": "itscritical",
  "It's Killing Time": "itskillingtime",
  "Dawnbringer's Resolve": "dawnbringersresolve",
  "Demon's Dance": "demonsdance",
  "Outlaw's Grit": "outlawsgrit",
  "Windspeaker's Blessing": "windspeakersblessing",
  "I'm a Baby Kitty Where is Mama": "babykitty",
  "Upgrade Zhonya's": "upgradezh",
  "Upgrade Infinity Edge": "upgradeie",
  "Upgrade Mikael's Blessing": "upgrademikaelsblessing",
  "Vampirism": "vampired",
  "Laser Heal": "laseheal",
  "Empyrean Promise": "empyreampromise",
  "Flash 2": "flash2",
  "Biggest Snowball Ever": "biggestsnowballever",
  "EscAPADe": "escapade",
  "Critical Rhythm": "criticalrhythm",
  "Snowball Upgrade": "snowballupgrade",
  "Snowball Roulette": "snowballroulette",
  "Swift and Safe": "swiftandsafe",
  "Mighty Shield": "mightyshield",
  "Poltergeist": "poltergeist",
  "ReEnergize": "mobiuscoil", // closest match - energize related
  "Veil of Warding": "fallenaegis", // shield-like
  "Wind Beneath Blade": "windbeneathblade",
  "Cheating": "cheating",
  "Divine Intervention": "quest_angelofretribution",
  "Get Excited": "getexcited",
  "Nightstalking": "nightstalking",
  "Spiritual Purification": "spiritualpurification",
  "Upgrade Collector": "upgradecollector",
  "Upgrade Cutlass": "upgradecutlass",
  "Upgrade Hubris": "upgradehubris",
  "Upgrade Immolate": "upgradeimmolate",
  "Upgrade Sheen": "upgradesheen",
  "Cruelty": "cruelty",
  "Final Form": "finalform",
  "Gash": "darksteeltalons",
  "Glass Cannon": "glasscannon",
  "Goldrend": "goldrend",
  "King Me": "kingme",
  "Ominous Pact": "phenomenalevil",
  "Protein Shake": "proteinshake",
  "Ultimate Awakening": "zerohour",
}

function nameToIconKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function findIconMatch(name: string): string | null {
  // Check manual mapping first
  if (MANUAL_MAPPINGS[name]) {
    const mapped = MANUAL_MAPPINGS[name]
    if (iconFiles.includes(mapped)) {
      return mapped
    }
  }

  // Try exact match (cleaned name)
  const cleanName = nameToIconKey(name)
  if (iconFiles.includes(cleanName)) {
    return cleanName
  }

  // Try finding an icon that contains significant words from the name
  const words = name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3)

  for (const icon of iconFiles) {
    // Check if icon contains multiple words from augment name
    const matchingWords = words.filter(w => icon.includes(w))
    if (matchingWords.length >= 2) {
      return icon
    }
    // Or a long word (6+ chars)
    if (matchingWords.some(w => w.length >= 6)) {
      return icon
    }
  }

  return null
}

// Build mapping
const mapping: Record<string, string | null> = {}
const usedIcons = new Set<string>()
const unmatched: string[] = []

for (const name of Object.keys(augments)) {
  const icon = findIconMatch(name)
  if (icon) {
    mapping[name] = icon
    usedIcons.add(icon)
  } else {
    mapping[name] = null
    unmatched.push(name)
  }
}

// Find unused icons
const unusedIcons = iconFiles.filter(icon => !usedIcons.has(icon))

console.log('=== UNMATCHED AUGMENTS (need manual mapping) ===')
if (unmatched.length === 0) {
  console.log('  None! All augments have icons.')
} else {
  for (const name of unmatched) {
    console.log(`  - ${name}`)
  }
}

console.log('\n=== UNUSED ICONS (will be deleted) ===')
if (unusedIcons.length === 0) {
  console.log('  None!')
} else {
  for (const icon of unusedIcons) {
    console.log(`  - ${icon}.png`)
  }
}

console.log(`\n=== SUMMARY ===`)
console.log(`Matched: ${Object.values(mapping).filter(Boolean).length}`)
console.log(`Unmatched: ${unmatched.length}`)
console.log(`Unused icons: ${unusedIcons.length}`)
console.log(`Total augments: ${Object.keys(augments).length}`)

// Delete unused icons
if (unusedIcons.length > 0) {
  console.log('\nDeleting unused icons...')
  for (const icon of unusedIcons) {
    const iconPath = path.join(ICONS_DIR, `${icon}.png`)
    fs.unlinkSync(iconPath)
    console.log(`  Deleted: ${icon}.png`)
  }
}

// Update augments.json with icon field
if (unmatched.length === 0) {
  console.log('\nUpdating augments.json with icon mappings...')
  const updatedAugments: Record<string, any> = {}
  for (const [name, data] of Object.entries(augments as Record<string, any>)) {
    updatedAugments[name] = {
      ...data,
      icon: mapping[name]
    }
  }
  fs.writeFileSync(AUGMENTS_PATH, JSON.stringify(updatedAugments, null, 2))
  console.log('Done! augments.json updated.')
} else {
  console.log('\n⚠️  Cannot update augments.json until all augments have icons.')
  console.log('Add manual mappings for the unmatched augments above.')
}
