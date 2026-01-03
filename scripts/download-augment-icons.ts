// Download ALL augment icons from Community Dragon
// Usage: npx tsx scripts/download-augment-icons.ts

import * as fs from 'fs'
import * as path from 'path'

const PATCH = '15.24'
const KIWI_BASE = `https://raw.communitydragon.org/${PATCH}/game/assets/ux/kiwi/augments/icons/`
const CHERRY_BASE = `https://raw.communitydragon.org/${PATCH}/game/assets/ux/cherry/augments/icons/`
const OUTPUT_DIR = path.join(__dirname, '../public/icons/augments')

async function fetchAllIcons(base: string): Promise<string[]> {
  const response = await fetch(base)
  const html = await response.text()
  // Extract all _large.png filenames
  const matches = html.matchAll(/href="([a-z0-9_]+_large\.png)"/g)
  return [...matches].map(m => m[1])
}

async function downloadIcon(filename: string, base: string): Promise<boolean> {
  const outputName = filename.replace('_large.png', '.png')
  const outputPath = path.join(OUTPUT_DIR, outputName)
  
  if (fs.existsSync(outputPath)) {
    return true // cached
  }

  try {
    const response = await fetch(base + filename)
    if (response.ok) {
      const buffer = await response.arrayBuffer()
      fs.writeFileSync(outputPath, Buffer.from(buffer))
      return true
    }
  } catch (e) {
    // Failed
  }
  return false
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Download from KIWI first (primary source for ARAM Mayhem)
  console.log('Fetching icon list from CDragon KIWI...')
  const kiwiIcons = await fetchAllIcons(KIWI_BASE)
  console.log(`Found ${kiwiIcons.length} icons in kiwi\n`)

  let downloaded = 0
  let cached = 0

  const CONCURRENT = 10
  for (let i = 0; i < kiwiIcons.length; i += CONCURRENT) {
    const batch = kiwiIcons.slice(i, i + CONCURRENT)
    const results = await Promise.all(batch.map(async (filename) => {
      const outputPath = path.join(OUTPUT_DIR, filename.replace('_large.png', '.png'))
      const wasCached = fs.existsSync(outputPath)
      const success = await downloadIcon(filename, KIWI_BASE)
      return { filename, success, wasCached }
    }))

    for (const r of results) {
      if (r.success) {
        if (r.wasCached) cached++
        else {
          downloaded++
          console.log(`✓ ${r.filename.replace('_large.png', '')} (kiwi)`)
        }
      }
    }
  }

  // Then download from CHERRY as fallback (for icons not in kiwi)
  console.log('\nFetching icon list from CDragon CHERRY (fallback)...')
  const cherryIcons = await fetchAllIcons(CHERRY_BASE)
  console.log(`Found ${cherryIcons.length} icons in cherry\n`)

  let cherryDownloaded = 0
  for (let i = 0; i < cherryIcons.length; i += CONCURRENT) {
    const batch = cherryIcons.slice(i, i + CONCURRENT)
    const results = await Promise.all(batch.map(async (filename) => {
      const outputPath = path.join(OUTPUT_DIR, filename.replace('_large.png', '.png'))
      const wasCached = fs.existsSync(outputPath)
      if (wasCached) return { filename, success: true, wasCached: true }
      const success = await downloadIcon(filename, CHERRY_BASE)
      return { filename, success, wasCached: false }
    }))

    for (const r of results) {
      if (r.success && !r.wasCached) {
        cherryDownloaded++
        console.log(`✓ ${r.filename.replace('_large.png', '')} (cherry fallback)`)
      }
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Downloaded from kiwi: ${downloaded}`)
  console.log(`Downloaded from cherry (fallback): ${cherryDownloaded}`)
  console.log(`Already cached: ${cached}`)
  console.log(`Total kiwi: ${kiwiIcons.length}`)
  console.log(`Total cherry: ${cherryIcons.length}`)
}

main().catch(console.error)
