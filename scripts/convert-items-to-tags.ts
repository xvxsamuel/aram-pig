// one-time script to convert all item descriptions to our internal tag format
// after running this, items.json will use <bold>, <keyword>, <tip>, <ad>, etc. directly
// and we can simplify the runtime tooltip rendering

import fs from 'fs/promises'
import path from 'path'

const ITEMS_JSON_PATH = path.join(process.cwd(), 'src', 'data', 'items.json')

interface LocalItem {
  name: string
  description: string
  totalCost: number
  itemType: string
  stats: Record<string, number>
}

/**
 * Convert CDragon HTML format to our internal tag format
 * Matches the output of cleanWikiMarkup from wiki-markup.ts
 */
export function convertCDragonToTags(description: string): string {
  let result = description

  // remove stats block (we show stats separately in header)
  result = result.replace(/<stats>[\s\S]*?<\/stats>/gi, '')
  
  // unwrap mainText container
  result = result.replace(/<mainText>([\s\S]*?)<\/mainText>/gi, '$1')
  result = result.replace(/<\/?mainText>/gi, '')
  
  // strip CDragon "Active -" or "Passive -" markers (the actual ability name follows)
  result = result.replace(/<active>\s*Active\s*-?\s*<\/active>\s*/gi, '')
  result = result.replace(/<passive>\s*Passive\s*-?\s*<\/passive>\s*/gi, '')

  // cooldown pattern: optional (Xs) or (Xs, max N charges) etc
  const cooldownPattern = '(?:\\s*\\(\\d+s(?:,\\s*[^)]+)?\\))?'
  
  // extra text after cooldown like "per target" or "per ally" before the <br>
  // this appears on items like Imperial Mandate: "<passive>Coordinated Fire</passive> (0s) per target<br>"
  // IMPORTANT: must NOT contain periods (which start new sentences) or other tags
  const postCooldownText = '(?:\\s*[^<.]{0,20})?'

  // passive/active at START of description or after <br><br> or </stats> = ability name (add colon, bold for passives too)
  // passive/active INLINE (mid-sentence) = keyword (no colon, no bold)
  
  // after </stats><br><br> or just <br><br> = ability name section
  // pattern: (</stats>)?<br><br>\s*<passive>Name</passive>[cooldown][extra text]<br>
  result = result.replace(new RegExp(`(<\\/stats>)?(<br\\s*\\/?>\\s*){1,2}<passive>([\\s\\S]*?)<\\/passive>${cooldownPattern}${postCooldownText}<br\\s*\\/?>`, 'gi'), (_, stats, brs, name) => {
    const trimmed = name.trim()
    return `${stats || ''}${brs || ''}<bold><keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword></bold> `
  })
  
  // <passive>Name</passive>[cooldown][extra text]<br> NOT preceded by other <br> = still ability name (first passive in description)
  result = result.replace(new RegExp(`<passive>([\\s\\S]*?)<\\/passive>${cooldownPattern}${postCooldownText}<br\\s*\\/?>`, 'gi'), (_, name) => {
    const trimmed = name.trim()
    return `<bold><keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword></bold> `
  })
  
  // remaining <passive>Name</passive> = inline keyword (NO colon, NO bold)
  result = result.replace(/<passive>([\s\S]*?)<\/passive>/gi, (_, name) => {
    const trimmed = name.trim()
    return `<keyword>${trimmed}</keyword>`
  })
  
  // after </stats><br><br> or just <br><br> = active ability name section
  result = result.replace(new RegExp(`(<\\/stats>)?(<br\\s*\\/?>\\s*){1,2}<active>([\\s\\S]*?)<\\/active>${cooldownPattern}${postCooldownText}<br\\s*\\/?>`, 'gi'), (_, stats, brs, name) => {
    const trimmed = name.trim()
    return `${stats || ''}${brs || ''}<bold><keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword></bold> `
  })
  
  // <active>Name</active>[cooldown][extra text]<br> = active ability name
  result = result.replace(new RegExp(`<active>([\\s\\S]*?)<\\/active>${cooldownPattern}${postCooldownText}<br\\s*\\/?>`, 'gi'), (_, name) => {
    const trimmed = name.trim()
    return `<bold><keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword></bold> `
  })
  
  // remaining <active>Name</active> = inline active keyword (NO colon, but still bold)
  result = result.replace(/<active>([\s\S]*?)<\/active>/gi, (_, name) => {
    const trimmed = name.trim()
    return `<bold><keyword>${trimmed}</keyword></bold>`
  })
  
  // <unique>Name</unique> [cooldown] <br> → <keyword>Name:</keyword> (consume the br, add space)
  result = result.replace(new RegExp(`<unique>([\\s\\S]*?)<\\/unique>${cooldownPattern}\\s*<br\\s*\\/?>`, 'gi'), (_, name) => {
    const trimmed = name.trim()
    return `<keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword> `
  })
  // fallback for unique without br after
  result = result.replace(new RegExp(`<unique>([\\s\\S]*?)<\\/unique>${cooldownPattern}`, 'gi'), (_, name) => {
    const trimmed = name.trim()
    return `<keyword>${trimmed}${trimmed.endsWith(':') ? '' : ':'}</keyword> `
  })
  
  // cleanup any remaining cooldown indicators that slipped through
  result = result.replace(/<\/keyword>(<\/bold>)?\s*\(\d+s(?:,\s*[^)]+)?\)\s*/gi, '</keyword>$1 ')
  
  // <attention>VALUE</attention> → <keyword>VALUE</keyword>
  result = result.replace(/<attention>([\s\S]*?)<\/attention>/gi, '<keyword>$1</keyword>')
  
  // keyword variants
  result = result.replace(/<keywordMajor>([\s\S]*?)<\/keywordMajor>/gi, '<keyword>$1</keyword>')
  result = result.replace(/<keywordStealth>([\s\S]*?)<\/keywordStealth>/gi, '<keyword>$1</keyword>')
  result = result.replace(/<prismatic>([\s\S]*?)<\/prismatic>/gi, '<keyword>$1</keyword>')
  result = result.replace(/<buffedStat>([\s\S]*?)<\/buffedStat>/gi, '<keyword>$1</keyword>')

  // damage type tags
  result = result.replace(/<physicalDamage>([\s\S]*?)<\/physicalDamage>/gi, '<ad-bonus>$1</ad-bonus>')
  result = result.replace(/<magicDamage>([\s\S]*?)<\/magicDamage>/gi, '<magic>$1</magic>')
  result = result.replace(/<trueDamage>([\s\S]*?)<\/trueDamage>/gi, '<true>$1</true>')

  // stat tags
  result = result.replace(/<attackSpeed>([\s\S]*?)<\/attackSpeed>/gi, '<keyword>$1</keyword>')
  result = result.replace(/<speed>([\s\S]*?)<\/speed>/gi, '<ms>$1</ms>')

  // healing/shield/omnivamp
  // CDragon uses <healing> for both healing effects AND health stat mentions
  // if content contains "Health" as a stat (like "bonus Health"), use <health> tag instead
  result = result.replace(/<healing>([\s\S]*?)<\/healing>/gi, (match, content) => {
    const trimmed = content.trim()
    // empty tags - remove them entirely
    if (!trimmed) return ''
    // "bonus Health", "Item Health", "maximum Health" etc = health stat, not healing
    if (/\b(?:bonus|item|maximum|max)\s+Health\b/i.test(trimmed)) {
      return `<health>${content}</health>`
    }
    // otherwise it's a healing effect
    return `<heal>${content}</heal>`
  })
  result = result.replace(/<shield>([\s\S]*?)<\/shield>/gi, '<shield>$1</shield>')
  result = result.replace(/<omnivamp>([\s\S]*?)<\/omnivamp>/gi, '<vamp>$1</vamp>')
  result = result.replace(/<lifesteal>([\s\S]*?)<\/lifesteal>/gi, '<vamp>$1</vamp>')

  // scaling stats
  result = result.replace(/<scaleAD>([\s\S]*?)<\/scaleAD>/gi, '<ad>$1</ad>')
  result = result.replace(/<scaleAP>([\s\S]*?)<\/scaleAP>/gi, '<ap>$1</ap>')
  result = result.replace(/<scaleHealth>([\s\S]*?)<\/scaleHealth>/gi, '<health>$1</health>')
  result = result.replace(/<scaleMana>([\s\S]*?)<\/scaleMana>/gi, '<mana>$1</mana>')
  result = result.replace(/<scaleArmor>([\s\S]*?)<\/scaleArmor>/gi, '<armor>$1</armor>')
  result = result.replace(/<scaleMR>([\s\S]*?)<\/scaleMR>/gi, '<mr>$1</mr>')
  result = result.replace(/<scaleLethality>([\s\S]*?)<\/scaleLethality>/gi, '<ad>$1</ad>')
  
  // on-hit keyword
  result = result.replace(/<OnHit>([\s\S]*?)<\/OnHit>/gi, '<keyword>$1</keyword>')

  // rarity tags
  result = result.replace(/<rarityMythic>([\s\S]*?)<\/rarityMythic>/gi, '<keyword>$1</keyword>')
  result = result.replace(/<rarityLegendary>([\s\S]*?)<\/rarityLegendary>/gi, '<keyword>$1</keyword>')

  // rules → italic
  result = result.replace(/<rules>([\s\S]*?)<\/rules>/gi, '<italic>$1</italic>')
  
  // flavorText → italic
  result = result.replace(/<flavorText>([\s\S]*?)<\/flavorText>/gi, '<italic>$1</italic>')
  
  // status tags → bold
  result = result.replace(/<status>([\s\S]*?)<\/status>/gi, '<bold>$1</bold>')
  
  // <b>text</b> → <bold>text</bold>
  result = result.replace(/<b>([\s\S]*?)<\/b>/gi, '<bold>$1</bold>')
  
  // <spellName>Name</spellName> → <keyword>Name</keyword>
  result = result.replace(/<spellName>([\s\S]*?)<\/spellName>/gi, '<keyword>$1</keyword>')

  // list items
  result = result.replace(/<li>/gi, '\n• ')
  result = result.replace(/<\/li>/gi, '')
  
  // remove font color tags (just keep content)
  result = result.replace(/<font[^>]*>([^<]+)<\/font>/gi, '$1')

  // line breaks
  result = result.replace(/<br\s*\/?>/gi, '\n')

  // post-process abbreviated CDragon terms
  // "Wounds" → "Grievous Wounds" (CDragon uses abbreviated form)
  // use negative lookbehind to avoid "Grievous Wounds" → "Grievous Grievous Wounds"
  result = result.replace(/(?<!Grievous\s)\bWounds\b/g, 'Grievous Wounds')

  // wrap standalone "Healing" and "Shielding" words as keywords (not already in tags)
  // these appear in phrases like "Healing or shielding an ally" without CDragon tags
  // negative lookbehind: not preceded by < (inside a tag) or > (just after opening tag)
  // negative lookahead: not followed by a value like "30%" (those stay as <heal>/<shield>)
  result = result.replace(/(?<![<>])\b(Healing|Shielding)\b(?!\s*\d)/gi, '<keyword>$1</keyword>')

  // wrap "Critical Strike" and variants with <crit> tag (CDragon doesn't tag these)
  // matches: "Critical Strike", "Critical Strike Chance", "Critical Strike Damage", "Critical Strikes", "Critically Strike"
  result = result.replace(/(?<![<>])\b(Critic(?:al(?:ly)?\s+Strike(?:s)?(?:\s+(?:Chance|Damage))?)?)\b/gi, '<crit>$1</crit>')

  // wrap "On-Hit" and "On-Attack" as keywords (CDragon doesn't tag these)
  // matches: "On-Hit", "On-Attack", "On-Attacking"
  result = result.replace(/(?<![<>])\b(On-Hit|On-Attack(?:ing)?)\b/gi, '<keyword>$1</keyword>')

  // replace "Item Health" with clearer "bonus Health from items"
  result = result.replace(/\bItem Health\b/gi, '<health><bold>bonus</bold> Health <bold>from items</bold></health>')

  // wrap health stat mentions with <health> tag (CDragon often doesn't tag these)
  // matches: "bonus Health", "maximum Health", "max Health"
  // only wrap if not already inside a <health> tag (check for > before and < after)
  result = result.replace(/(?<![<>])\b((?:bonus|maximum|max)\s+Health)\b(?![^<]*<\/health>)/gi, '<health>$1</health>')

  // fix nested <health> tags - unwrap inner ones
  // pattern: <health>...<health>inner</health>...</health> → <health>...inner...</health>
  result = result.replace(/<health>([^<]*)<health>([^<]*)<\/health>([^<]*)<\/health>/gi, '<health>$1$2$3</health>')

  // remove CDragon placeholder values like "(0)" or "(<heal>0</heal>)"
  result = result.replace(/\s*\(<heal>0<\/heal>\)/g, '')
  result = result.replace(/\s*\(0\)/g, '')

  // clean up whitespace
  result = result.replace(/\n{3,}/g, '\n\n')
  result = result.split('\n').map(line => line.trim()).join('\n')
  // collapse multiple spaces into single space (but preserve newlines)
  result = result.replace(/[ \t]{2,}/g, ' ')
  // remove space after colon at start of keyword content (e.g., ": text" → ":text" won't happen, but handles "</keyword> text")
  // actually we want to ensure there's exactly one space after </keyword>
  result = result.replace(/<\/keyword>\s+/g, '</keyword> ')
  result = result.trim()

  return result
}

/**
 * Convert wiki markup format to our internal tag format
 * EXACTLY matches cleanWikiMarkup from wiki-markup.ts
 */
export function convertWikiToTags(description: string): string {
  let cleaned = description

  // '''text''' - bold (three single quotes)
  cleaned = cleaned.replace(/'''(.+?)'''/g, '<bold>$1</bold>')

  // ''text'' - italic (two single quotes)
  cleaned = cleaned.replace(/''(.+?)''/g, '<italic>$1</italic>')

  // remove leftover unpaired quote markers
  cleaned = cleaned.replace(/''/g, '')

  // process templates iteratively (handle nesting)
  let prevCleaned = ''
  let iterations = 0
  while (cleaned !== prevCleaned && cleaned.includes('{{') && iterations < 20) {
    prevCleaned = cleaned
    iterations++

    // {{#invoke:...}} - remove
    cleaned = cleaned.replace(/\{\{#invoke:[^}]+\}\}/g, '')

    // {{#vardefineecho:varname|value}} - extract value
    cleaned = cleaned.replace(/\{\{#vardefineecho:[^|]+\|([^}]+)\}\}/g, '$1')
    
    // {{#var:varname}} - remove
    cleaned = cleaned.replace(/\{\{#var:[^}]+\}\}/g, '')

    // {{ap|value}} - extract value (eval math if needed)
    cleaned = cleaned.replace(/\{\{ap\|([^}]+)\}\}/g, (match, value) => {
      const trimmed = value.trim()
      if (/^[\d.+\-*/]+$/.test(trimmed)) {
        try { return eval(trimmed).toString() } catch { return value }
      }
      if (/^[\d\s+\-*/().]+$/.test(trimmed)) {
        try { return eval(trimmed).toString() } catch { return value }
      }
      return value
    })

    // {{fd|number}} - formatted decimal
    cleaned = cleaned.replace(/\{\{fd\|([^}]+)\}\}/g, '$1')

    // {{g|value}} → <gold>value</gold>
    cleaned = cleaned.replace(/\{\{g\|([^}]+)\}\}/g, '<gold>$1</gold>')

    // {{rd|value1|value2}} - simple ratio display (NO wrapping yet - done after loop)
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\|([^}|]+)([^}]*)\}\}/g, '$1 / $2')
    // {{rd|value}} - single value
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\}\}/g, '$1')

    // {{pp|...}} patterns
    cleaned = cleaned.replace(/\{\{pp\|type=([^|]+)\|([^|]+)\|[^}]*\}\}/g, (match, type, values) => {
      const nums = values.split(';').map((v: string) => parseFloat(v.trim())).filter((n: number) => !isNaN(n))
      if (nums.length > 0) {
        const min = Math.min(...nums)
        const max = Math.max(...nums)
        return `${min} – ${max} (based on ${type})`
      }
      return values
    })
    cleaned = cleaned.replace(/\{\{pp\|([^}]*?)formula=([^}]+)\}\}/g, '$2')
    cleaned = cleaned.replace(/\{\{pp\|([^}|]+)([^}]*)\}\}/g, '$1')

    // {{tt|text|tooltip}} → text
    cleaned = cleaned.replace(/\{\{tt\|([^}|]+)\|([^}]*)\}\}/g, '$1')

    // {{ft|text|fallback}} → text
    cleaned = cleaned.replace(/\{\{ft\|([^|]+?(?:\{\{[^}]+\}\}[^|]*)*)\|[^}]+(?:\{\{[^}]+\}\}[^}]*)*\}\}/g, ' $1 ')

    // {{tip|keyword|icononly=true}} → icon only
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|icononly\s*=\s*true\}\}/gi, '<tip>$1|||ICONONLY</tip>')

    // {{tip|keyword|display}} → <tip>keyword|||display</tip>
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|([^}]+)\}\}/gi, (match, keyword, display) => {
      if (display.includes('icononly')) return match
      return `<tip>${keyword}|||${display}</tip>`
    })
    
    // {{tip|keyword}} → <tip>keyword|||keyword</tip>
    cleaned = cleaned.replace(/\{\{tip\|([^}]+)\}\}/gi, '<tip>$1|||$1</tip>')

    // {{bi|buff|display}} → <keyword>display</keyword>
    cleaned = cleaned.replace(/\{\{bi\|([^}|]+)\|([^}]+)\}\}/g, '<keyword>$2</keyword>')
    cleaned = cleaned.replace(/\{\{bi\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{ii|item}} → <keyword>item</keyword>
    cleaned = cleaned.replace(/\{\{ii\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{nie|effect}} → <keyword>effect</keyword>
    cleaned = cleaned.replace(/\{\{nie\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{si|spell}} → <keyword>spell</keyword>
    cleaned = cleaned.replace(/\{\{si\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{ri|rune}} → <keyword>rune</keyword>
    cleaned = cleaned.replace(/\{\{ri\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{ai|ability|champion|display}} → <keyword>display</keyword>
    cleaned = cleaned.replace(/\{\{ai\|([^}|]+)\|([^}|]+)\|([^}|]+)\}\}/g, '<keyword>$3</keyword>')
    cleaned = cleaned.replace(/\{\{ai\|([^}|]+)\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{cai|ability|champion}} → <keyword>ability</keyword>
    cleaned = cleaned.replace(/\{\{cai\|([^}|]+)\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{ais|ability|champion}} → <keyword>ability</keyword>'s
    cleaned = cleaned.replace(/\{\{ais\|([^}|]+)\|([^}|]+)\}\}/g, "<keyword>$1</keyword>'s")

    // {{cis|champion}} → <keyword>champion</keyword>
    cleaned = cleaned.replace(/\{\{cis\|([^}|]+)\}\}/g, '<keyword>$1</keyword>')

    // {{sbc|label}} → <bold>label</bold>
    cleaned = cleaned.replace(/\{\{sbc\|([^}]+)\}\}/g, '<bold>$1</bold>')

    // {{ccs|text|type}} → text
    cleaned = cleaned.replace(/\{\{ccs\|([^}|]+)\|([^}|]+)\}\}/g, '$1')

    // {{sti|type|content}} - stat icon with type
    cleaned = cleaned.replace(/\{\{(?:sti|ai)\|([^}|]+)\|([^}]+)\}\}/g, (match, type, content) => {
      const lower = type.toLowerCase()
      if (lower === 'cdr' || lower === 'ability haste') return `<haste>${content}</haste>`
      if (lower === 'ad' || lower === 'attack damage') return `<ad>${content}</ad>`
      if (lower === 'ap' || lower === 'ability power') return `<ap>${content}</ap>`
      if (lower === 'health' || lower === 'hp') return `<health>${content}</health>`
      if (lower === 'mana' || lower === 'mp') return `<mana>${content}</mana>`
      if (lower === 'armor') return `<armor>${content}</armor>`
      if (lower === 'magic resistance' || lower === 'mr') return `<mr>${content}</mr>`
      if (lower === 'movement speed' || lower === 'ms') return `<ms>${content}</ms>`
      if (lower.includes('heal') || lower.includes('shield')) return `<heal>${content}</heal>`
      return `<keyword>${content}</keyword>`
    })

    // {{sti|text}} - single param
    cleaned = cleaned.replace(/\{\{(?:sti|ai)\|(.+?)\}\}/g, '$1')

    // {{stil|text}} - stat icon link
    cleaned = cleaned.replace(/\{\{stil\|([^}|]+)\}\}/g, (match, content) => {
      const lower = content.toLowerCase()
      if (lower.includes('heal') || lower.includes('shield')) return `<heal>${content}</heal>`
      if (lower.includes('health') || lower.includes('regeneration')) return `<health>${content}</health>`
      return `<keyword>${content}</keyword>`
    })

    // process single-parameter {{as|text}} templates
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\}\}/g, (match, content) => {
      const lower = content.toLowerCase()

      // check for multi-word phrases first
      if (lower.includes('magic resistance')) return `<mr>${content}</mr>`
      if (lower.includes('magic damage')) return `<magic>${content}</magic>`
      if (lower.includes('physical damage')) return `<ad-bonus>${content}</ad-bonus>`
      if (lower.includes('attack damage')) return `<ad>${content}</ad>`
      if (lower.includes('ability power')) return `<ap>${content}</ap>`
      if (lower.includes('lethality')) return `<ad>${content}</ad>`
      if (lower.includes('omnivamp')) return `<vamp>${content}</vamp>`

      // check for single words at the end
      const words = lower.replace(/[()%]/g, '').trim().split(/\s+/)
      const lastWord = words[words.length - 1]

      if (lastWord === 'health' || lastWord === 'hp') return `<health>${content}</health>`
      if (lastWord === 'mana' || lastWord === 'mp') return `<mana>${content}</mana>`
      if (lastWord === 'armor') return `<armor>${content}</armor>`
      if (lastWord === 'mr') return `<mr>${content}</mr>`
      if (lastWord === 'ap') return `<ap>${content}</ap>`
      if (lastWord === 'ad') return `<ad>${content}</ad>`
      if (lastWord === 'magic') return `<magic>${content}</magic>`

      return content
    })

    // {{as|text|type}} - two parameters (simple content first)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|true damage\}\}/gi, '<true>$1</true>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|magic damage\}\}/gi, '<magic>$1</magic>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|physical damage\}\}/gi, '<ad-bonus>$1</ad-bonus>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ad\}\}/gi, '<ad>$1</ad>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ap\}\}/gi, '<ap>$1</ap>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:health|hp)\}\}/gi, '<health>$1</health>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:mana|mp)\}\}/gi, '<mana>$1</mana>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|armor\}\}/gi, '<armor>$1</armor>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:magic resistance|mr)\}\}/gi, '<mr>$1</mr>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:healing|heal|shield|shielding|hsp)\}\}/gi, '<heal>$1</heal>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:movement speed|ms)\}\}/gi, '<ms>$1</ms>')

    // {{as|text|buzzword...}} - special highlight
    cleaned = cleaned.replace(/\{\{as\|(<bold>.*?<\/bold>)\|buzzword\d*\}\}/gi, '$1')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|buzzword\d*\}\}/gi, '<keyword>$1</keyword>')

    // nested content (with markers) - use .+? for greedy match
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|magic damage\}\}/gi, '<magic>$1</magic>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|physical damage\}\}/gi, '<ad-bonus>$1</ad-bonus>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|ad\}\}/gi, '<ad>$1</ad>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|ap\}\}/gi, '<ap>$1</ap>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:health|hp)\}\}/gi, '<health>$1</health>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:mana|mp)\}\}/gi, '<mana>$1</mana>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|armor\}\}/gi, '<armor>$1</armor>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:magic resistance|mr)\}\}/gi, '<mr>$1</mr>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:healing|heal|shield|shielding|hsp)\}\}/gi, '<heal>$1</heal>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:movement speed|ms)\}\}/gi, '<ms>$1</ms>')
    cleaned = cleaned.replace(/\{\{as\|(<bold>.*?<\/bold>)\|buzzword\d*\}\}/gi, '$1')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|buzzword\d*\}\}/gi, '$1')

    // remove any remaining {{}} templates
    cleaned = cleaned.replace(/\{\{([^}]+)\}\}/g, '')
  }

  // process [[link]] brackets AFTER the loop
  // [[File:...]] - remove
  cleaned = cleaned.replace(/\[\[File:[^\]]+\]\]/g, '')
  // [[link|text]] - show text
  cleaned = cleaned.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  // [[on-hit]] and [[on-attack]] - convert to keyword
  cleaned = cleaned.replace(/\[\[(on-hit|on-attack)\]\]/g, '<keyword>$1</keyword>')
  // [[link]] - show link
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, '$1')
  
  // [text] - single bracket links
  cleaned = cleaned.replace(/\[([^\]]+)\]/g, '$1')

  // process plain text rd - add melee/ranged icons AFTER loop
  // first handle "range – range / range – range" patterns
  cleaned = cleaned.replace(
    /(\d+\.?\d*)\s*–\s*(\d+\.?\d*)\s*\/\s*(\d+\.?\d*)\s*–\s*(\d+\.?\d*)/g,
    '<rd><tip>melee|||ICONONLY</tip> $1 – $2 / <tip>ranged|||ICONONLY</tip> $3 – $4</rd>'
  )

  // then handle simple "number / number" patterns
  cleaned = cleaned.replace(
    /\b(\d+\.?\d*%?)\s*\/\s*(\d+\.?\d*%?)\b/g,
    '<rd><tip>melee|||ICONONLY</tip> $1 / <tip>ranged|||ICONONLY</tip> $2</rd>'
  )

  // remove leading ": " (wiki markup indentation)
  cleaned = cleaned.replace(/^:\s+/gm, '')

  // remove HTML comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '')

  // convert HTML list tags
  cleaned = cleaned.replace(/<ul>/gi, '\n')
  cleaned = cleaned.replace(/<\/ul>/gi, '\n')
  cleaned = cleaned.replace(/<li>/gi, '• ')
  cleaned = cleaned.replace(/<\/li>/gi, '\n')

  // convert <br> tags to newlines
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n')

  // clean up multiple consecutive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')

  // detect and wrap passive/active names at the start of lines
  // pattern: "SomeName:" at the start, with max 40 chars before the colon
  // but skip if already wrapped in a tag (e.g., <keyword>)
  cleaned = cleaned.replace(/^([^<\n]{1,40}?):\s*/gm, (match, name) => {
    const trimmedName = name.trim()
    // skip if it looks like a stat or number pattern
    if (/^\d/.test(trimmedName)) return match
    if (/^[+\-]/.test(trimmedName)) return match
    // skip single word followed by number (like "Health: 400")
    if (/^\w+\s*$/.test(trimmedName) && /^\d/.test(match.slice(name.length + 1))) return match
    return `<keyword>${trimmedName}:</keyword> `
  })

  return cleaned
}

/**
 * Check if description is CDragon HTML format
 */
function isCDragonFormat(description: string): boolean {
  return /<(mainText|stats|passive|active|attention)>/i.test(description)
}

/**
 * Check if description is wiki markup format
 */
function isWikiFormat(description: string): boolean {
  // check for wiki templates {{...}}, bold ''', italic '', or links [[...]]
  return /\{\{(tip|as|rd|tt|g)\|/.test(description) || /'''/.test(description) || /''/.test(description) || /\[\[/.test(description)
}

/**
 * Check if description already uses our internal tags
 */
function isTagFormat(description: string): boolean {
  return /<(keyword|tip|ad|ap|magic|health|mana|armor|mr|heal|vamp|ms|true|bold|italic|rd|gold)>/i.test(description)
}

async function main() {
  console.log('Converting item descriptions to internal tag format...')
  
  const itemsJson = await fs.readFile(ITEMS_JSON_PATH, 'utf-8')
  const items: Record<string, LocalItem> = JSON.parse(itemsJson)
  
  let convertedCDragon = 0
  let convertedWiki = 0
  let alreadyTags = 0
  let skipped = 0
  
  for (const [id, item] of Object.entries(items)) {
    if (!item.description) {
      skipped++
      continue
    }
    
    const desc = item.description
    
    if (isTagFormat(desc) && !isCDragonFormat(desc) && !isWikiFormat(desc)) {
      alreadyTags++
      continue
    }
    
    if (isCDragonFormat(desc)) {
      item.description = convertCDragonToTags(desc)
      convertedCDragon++
      console.log(`CDragon: ${item.name} (${id})`)
    } else if (isWikiFormat(desc)) {
      item.description = convertWikiToTags(desc)
      convertedWiki++
      console.log(`Wiki: ${item.name} (${id})`)
    } else {
      skipped++
    }
  }
  
  console.log('\n=== CONVERSION SUMMARY ===')
  console.log(`CDragon → Tags: ${convertedCDragon}`)
  console.log(`Wiki → Tags: ${convertedWiki}`)
  console.log(`Already tags: ${alreadyTags}`)
  console.log(`Skipped: ${skipped}`)
  
  console.log('\nWriting items.json...')
  await fs.writeFile(ITEMS_JSON_PATH, JSON.stringify(items, null, 2), 'utf-8')
  console.log('Done!')
}

// only run main when script is executed directly, not when imported
const isDirectRun = import.meta.url.startsWith('file:') && process.argv[1]?.includes('convert-items-to-tags')
if (isDirectRun) {
  main().catch(console.error)
}
