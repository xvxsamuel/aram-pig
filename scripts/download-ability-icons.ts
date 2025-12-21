
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

async function fetchWithTimeout(url: string, timeout = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function downloadImage(url: string, destPath: string, retries = 20) {
  try {
    // check if file exists
    try {
      await fs.access(destPath);
      // console.log(`Skipping ${destPath} (already exists)`);
      return;
    } catch {
      // file doesn't exist, continue
    }

    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetchWithTimeout(url, 5000);
        
        if (res.status === 404) {
            // console.warn(`Image not found (404): ${url}`);
            // retry on 404 as well, in case of cdn propagation issues or flakiness
            throw new Error(`404 Not Found`);
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
        if (i === retries - 1) {
            console.error(`Failed to download ${url} after ${retries} attempts:`, err);
            return;
        }
        // exponential backoff: 1s, 1.5s, 2.25s...
        const delay = 1000 * Math.pow(1.2, i);
        console.log(`Retry ${i + 1}/${retries} for ${url} in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
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
    // use championFull.json to get spell filenames
    const championData = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`);
    const champions = Object.values(championData.data) as any[];
    
    console.log(`Found ${champions.length} champions.`);

    const abilities = ['p', 'q', 'w', 'e', 'r'];
    
    // process in chunks to avoid overwhelming the server or file system
    const chunkSize = 5;
    for (let i = 0; i < champions.length; i += chunkSize) {
      const chunk = champions.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (champion) => {
        const championId = champion.id; // e.g. "Aatrox", "MonkeyKing"
        
        // map abilities to image filenames and base urls
        const abilityMap: Record<string, { filename: string, type: 'spell' | 'passive' }> = {};
        
        if (champion.passive && champion.passive.image) {
            abilityMap['p'] = { filename: champion.passive.image.full, type: 'passive' };
        }
        
        if (champion.spells) {
            if (champion.spells[0]) abilityMap['q'] = { filename: champion.spells[0].image.full, type: 'spell' };
            if (champion.spells[1]) abilityMap['w'] = { filename: champion.spells[1].image.full, type: 'spell' };
            if (champion.spells[2]) abilityMap['e'] = { filename: champion.spells[2].image.full, type: 'spell' };
            if (champion.spells[3]) abilityMap['r'] = { filename: champion.spells[3].image.full, type: 'spell' };
        }

        for (const ability of abilities) {
            const info = abilityMap[ability];
            if (!info) {
                // console.warn(`Missing info for ${championId} ability ${ability}`);
                continue;
            }

            const baseUrl = info.type === 'passive' 
                ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/passive`
                : `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell`;
                
            const url = `${baseUrl}/${info.filename}`;
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
