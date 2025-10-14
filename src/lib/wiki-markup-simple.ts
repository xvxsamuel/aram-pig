// simple wiki markup parser - convert to plain text with markers first, then to react

export function cleanWikiMarkup(text: string): string {
  let cleaned = text
  
  // keep replacing nested templates until none left
  let prevCleaned = ''
  let iterations = 0
  while (cleaned !== prevCleaned && cleaned.includes('{{') && iterations < 20) {
    prevCleaned = cleaned
    iterations++
    
    // {{fd|number}} - formatted decimal
    cleaned = cleaned.replace(/\{\{fd\|([^}]+)\}\}/g, '$1')
    
    // {{rd|value1|value2}} - ratio display, show as "value1 / value2"
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\|([^}|]+)([^}]*)\}\}/g, '$1 / $2')
    // {{rd|value}} - single value, just show it
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\}\}/g, '$1')
    
    // {{pp|...formula=text...}} - per-level progression
    cleaned = cleaned.replace(/\{\{pp\|([^}]*?)formula=([^}]+)\}\}/g, '$2')
    cleaned = cleaned.replace(/\{\{pp\|([^}|]+)([^}]*)\}\}/g, '$1')
    
    // {{tt|text|tooltip}} - show text only
    cleaned = cleaned.replace(/\{\{tt\|([^}|]+)\|([^}]*)\}\}/g, '$1')
    
    // {{ft|text|fallback}} - show first option
    cleaned = cleaned.replace(/\{\{ft\|([^}|]+)\|([^}]*)\}\}/g, '$1')
    
    // {{tip|keyword|icononly=true}} or {{tip|keyword|icononly = true}} - skip icon-only (with or without spaces)
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|icononly\s*=\s*true\}\}/g, '')
    
    // {{tip|keyword|display}} - use display text with keyword preserved for icon lookup using special delimiter
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|([^}]+)\}\}/g, (match, keyword, display) => {
      // skip if display contains icononly parameter
      if (display.includes('icononly')) return ''
      return `<tip>${keyword}|||${display}</tip>`
    })
    
    // {{tip|keyword}} - use keyword with itself as display
    cleaned = cleaned.replace(/\{\{tip\|([^}]+)\}\}/g, '<tip>$1|||$1</tip>')
    
    // {{sti|text}} or {{ai|text}} - stat/ability icon
    cleaned = cleaned.replace(/\{\{(?:sti|ai)\|([^}]+)\}\}/g, '<keyword>$1</keyword>')
    
    // {{as|text|ad}} - base ad scaling (yellowish orange)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ad\}\}/g, '<ad>$1</ad>')
    
    // {{as|text|ap}} - ap scaling (purple)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ap\}\}/g, '<magic>$1</magic>')
    
    // {{as|text|magic damage}} - magic damage (purple)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|magic damage\}\}/g, '<magic>$1</magic>')
    
    // {{as|text|physical damage}} - bonus physical damage (darker orange)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|physical damage\}\}/g, '<ad-bonus>$1</ad-bonus>')
    
    // {{as|text|health}} - health (green)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|health\}\}/g, '<health>$1</health>')
    
    // {{as|text|mana}} - mana (blue)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|mana\}\}/g, '<mana>$1</mana>')
    
    // {{as|text|healing}} or {{as|text|heal}} - healing (bright green)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:healing|heal)\}\}/g, '<heal>$1</heal>')
    
    // {{as|text|shield}} or {{as|text|shielding}} - shielding (bright green)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:shield|shielding)\}\}/g, '<heal>$1</heal>')
    
    // {{as|text|movement speed}} or {{as|text|ms}} - movement speed (lime green)
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:movement speed|ms)\}\}/g, '<ms>$1</ms>')
    
    // {{as|text|other}} - generic scaling (teal color), catch-all for other types
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|[^}]+\}\}/g, '<scaling>$1</scaling>')
    
    // {{as|text}} - check if it contains AP-related content for smart coloring
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\}\}/g, (match, content) => {
      const lower = content.toLowerCase()
      // if content mentions ability power, treat as magic (purple)
      if (lower.includes('ability power')) {
        return `<magic>${content}</magic>`
      }
      // if content mentions mana, treat as mana (blue)
      if (lower.includes('mana') && !lower.includes('maximum mana')) {
        return `<mana>${content}</mana>`
      }
      // if content mentions health, treat as health (green)
      if (lower.includes('health') && !lower.includes('maximum health')) {
        return `<health>${content}</health>`
      }
      // if content mentions AP, treat as magic (purple)
      if (lower.includes('ap')) {
        return `<magic>${content}</magic>`
      }
      // if content mentions AD or attack damage, treat as ad (yellowish orange)
      if ((lower.includes('ad') && !lower.includes('load')) || lower.includes('attack damage')) {
        return `<ad>${content}</ad>`
      }
      // otherwise generic scaling (teal)
      return `<scaling>${content}</scaling>`
    })
    
    // {{ap|value}} - ability power (purple)
    cleaned = cleaned.replace(/\{\{ap\|([^}]+)\}\}/g, '<magic>$1</magic>')

    
    // remove any remaining {{}} templates
    cleaned = cleaned.replace(/\{\{([^}]+)\}\}/g, '')
  }
  
  // [[link|text]] - show text
  cleaned = cleaned.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  // [[link]] - show link
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, '$1')
  
  // '''text''' - bold (three single quotes) - handle before italic
  cleaned = cleaned.replace(/'''([^']+)'''/g, '<bold>$1</bold>')
  
  // ''text'' - italic (two single quotes) - handle after bold
  cleaned = cleaned.replace(/''([^']+)''/g, '<italic>$1</italic>')
  
  return cleaned
}
