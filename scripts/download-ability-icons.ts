
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PUBLIC_DIR = path.join(__dirname, '../public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons/abilities');

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return res.json();
}

async function downloadImage(url: string, destPath: string, retries = 3) {
  try {
    // Check if file exists
    try {
      await fs.access(destPath);
      // console.log(`Skipping ${destPath} (already exists)`);
      return;
    } catch {
      // File doesn't exist, continue
    }

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url);
        
        if (res.status === 404) {
            // console.warn(`Image not found (404): ${url}`);
            return;
        }

        if (!res.ok) {
            throw new Error(`Status ${res.status} ${res.statusText}`);
        }
        
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        await fs.mkdir(path.dirname(destPath), { recursive: true });
        await fs.writeFile(destPath, buffer);
        console.log(`Downloaded: ${destPath}`);
        return;
      } catch (err) {
        if (i === retries - 1) throw err;
        // Exponential backoff: 1s, 2s, 4s
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
      }
    }
  } catch (error) {
    console.error(`Error downloading ${url}:`, error);
  }
}

async function main() {
  try {
    console.log('Fetching latest version...');
    const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json');
    const version = versions[0];
    console.log(`Latest version: ${version}`);

    console.log('Fetching champion list...');
    const championData = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`);
    const champions = Object.values(championData.data) as any[];
    
    console.log(`Found ${champions.length} champions.`);

    const abilities = ['p', 'q', 'w', 'e', 'r'];
    
    // Process in chunks to avoid overwhelming the server or file system
    const chunkSize = 5;
    for (let i = 0; i < champions.length; i += chunkSize) {
      const chunk = champions.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (champion) => {
        const championId = champion.id; // e.g. "Aatrox", "MonkeyKing"
        
        for (const ability of abilities) {
            // Use 'latest' or specific version. CommunityDragon supports 'latest' or version.
            // Using specific version ensures consistency with the champion list we fetched.
            // However, CommunityDragon might not have the exact same version string format or might be slightly behind/ahead.
            // 'latest' is usually safe for icons.
            // But the user mentioned "cdn endpoint is prob rather slow", so we want to cache them.
            
            // CommunityDragon URL structure:
            // https://cdn.communitydragon.org/{version}/champion/{champion}/ability-icon/{ability}
            // ability is p, q, w, e, r
            
            const url = `https://cdn.communitydragon.org/${version}/champion/${championId}/ability-icon/${ability}`;
            const destPath = path.join(ICONS_DIR, championId, `${ability}.png`);
            
            await downloadImage(url, destPath);
        }
      }));
      console.log(`Processed ${Math.min(i + chunkSize, champions.length)}/${champions.length} champions`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
