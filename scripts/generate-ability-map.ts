    
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '../src/data');
const OUTPUT_FILE = path.join(DATA_DIR, 'ability-icons.json');

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  return res.json();
}

async function main() {
  try {
    console.log('Fetching latest version...');
    const versions = await fetchJson('https://ddragon.leagueoflegends.com/api/versions.json');
    const version = versions[0];
    console.log(`Latest version: ${version}`);

    console.log('Fetching champion list...');
    const championData = await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/championFull.json`);
    const champions = Object.values(championData.data) as any[];
    
    console.log(`Found ${champions.length} champions. Generating map...`);

    const abilityMap: Record<string, Record<string, string>> = {};

    for (const champion of champions) {
        const championId = champion.id;
        abilityMap[championId] = {};

        // passive
        if (champion.passive && champion.passive.image) {
            abilityMap[championId]['P'] = champion.passive.image.full;
        }

        // spells (q, w, e, r)
        const keys = ['Q', 'W', 'E', 'R'];
        if (champion.spells) {
            champion.spells.forEach((spell: any, index: number) => {
                if (index < 4) {
                    abilityMap[championId][keys[index]] = spell.image.full;
                }
            });
        }
    }

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(abilityMap, null, 2));
    console.log(`Map generated at ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

main();
