import * as fs from 'fs';
import * as path from 'path';

// Read the Lua file
const luaFilePath = path.join(__dirname, '../src/data/augments.lua');
const luaContent = fs.readFileSync(luaFilePath, 'utf-8');

// Parse Lua table to JSON
function parseLuaToJson(luaContent: string): Record<string, any> {
  const result: Record<string, any> = {};
  
  // Remove the "return {" at the start and "}" at the end
  let content = luaContent.trim();
  content = content.replace(/^--\s*<pre>\s*\n?/, ''); // Remove -- <pre>
  content = content.replace(/^return\s*{/, '');
  content = content.replace(/}\s*$/, '');
  
  // Split by top-level entries (each augment starts with ["Name"] = {)
  const augmentPattern = /\["([^"]+)"\]\s*=\s*\{([\s\S]*?)\n\t\},?/g;
  
  let match;
  while ((match = augmentPattern.exec(content)) !== null) {
    const augmentName = match[1];
    const augmentBody = match[2];
    
    // Extract description (can be multi-line, so use [\s\S]*?)
    const descMatch = augmentBody.match(/\["description"\]\s*=\s*"([\s\S]*?)"/);
    const description = descMatch ? descMatch[1] : '';
    
    // Extract tier
    const tierMatch = augmentBody.match(/\["tier"\]\s*=\s*"([^"]*)"/);
    const tier = tierMatch ? tierMatch[1] : '';
    
    result[augmentName] = {
      description,
      tier
    };
  }
  
  return result;
}

// Convert and save
const jsonData = parseLuaToJson(luaContent);
const outputPath = path.join(__dirname, '../src/data/augments.json');
fs.writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf-8');

console.log(`Successfully converted augments.lua to augments.json`);
console.log(`Total augments: ${Object.keys(jsonData).length}`);
