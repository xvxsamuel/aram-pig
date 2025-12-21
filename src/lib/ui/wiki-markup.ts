// simple wiki markup parser - convert to plain text with markers first, then to react

export function cleanWikiMarkup(text: string): string {
  let cleaned = text

  // '''text''' - bold (three single quotes) - process first before templates
  cleaned = cleaned.replace(/'''(.+?)'''/g, '<bold>$1</bold>')

  // ''text'' - italic (two single quotes) - process first before templates
  cleaned = cleaned.replace(/''(.+?)''/g, '<italic>$1</italic>')

  // keep replacing nested templates until none left
  let prevCleaned = ''
  let iterations = 0
  while (cleaned !== prevCleaned && cleaned.includes('{{') && iterations < 20) {
    prevCleaned = cleaned
    iterations++

    // {{#vardefineecho:varname|value}} - mediawiki variable definition, extract the value
    cleaned = cleaned.replace(/\{\{#vardefineecho:[^|]+\|([^}]+)\}\}/g, '$1')
    
    // {{#var:varname}} - mediawiki variable reference, just remove it (we don't track variables)
    cleaned = cleaned.replace(/\{\{#var:[^}]+\}\}/g, '')

    // ability power, evaluate math expressions if needed
    cleaned = cleaned.replace(/\{\{ap\|([^}]+)\}\}/g, (match, value) => {
      const trimmed = value.trim()
      // if it's a simple math expression (no spaces), try to evaluate it
      if (/^[\d.+\-*/]+$/.test(trimmed)) {
        try {
          const result = eval(trimmed)
          return result.toString()
        } catch {
          return value
        }
      }
      // if it contains parens and math with spaces like "(60/6)+10", evaluate it
      if (/^[\d\s+\-*/().]+$/.test(trimmed)) {
        try {
          const result = eval(trimmed)
          return result.toString()
        } catch {
          return value
        }
      }
      return value
    })

    // {{fd|number}} - formatted decimal
    cleaned = cleaned.replace(/\{\{fd\|([^}]+)\}\}/g, '$1')

    // {{g|value}} - gold with icon
    cleaned = cleaned.replace(/\{\{g\|([^}]+)\}\}/g, '<gold>$1</gold>')

    // {{rd|range1|range2|levels=...|pp=true}} - complex ratio display with ranges
    cleaned = cleaned.replace(
      /\{\{rd\|([^|]+)\s+to\s+([^|]+)\s+for\s+\d+\|([^|]+)\s+to\s+([^|]+)\s+for\s+\d+[^}]*\}\}/g,
      (match, min1, max1, min2, max2) => {
        // evaluate math expressions if present
        const evalSafe = (expr: string): string => {
          const trimmed = expr.trim()
          if (/^[\d.+\-*/]+$/.test(trimmed)) {
            try {
              return eval(trimmed).toString()
            } catch {
              return trimmed
            }
          }
          return trimmed
        }

        const melee1 = evalSafe(min1)
        const melee2 = evalSafe(max1)
        const ranged1 = evalSafe(min2)
        const ranged2 = evalSafe(max2)

        return `${melee1} – ${melee2} / ${ranged1} – ${ranged2}`
      }
    )

    // {{rd|value1|value2}} - simple ratio display
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\|([^}|]+)([^}]*)\}\}/g, '$1 / $2')
    // {{rd|value}} - single value
    cleaned = cleaned.replace(/\{\{rd\|([^}|]+)\}\}/g, '$1')

    // {{pp|type=text|values;separated;by;semicolons|range|...}} - extract min/max from semicolon list
    cleaned = cleaned.replace(/\{\{pp\|type=([^|]+)\|([^|]+)\|[^}]*\}\}/g, (match, type, values) => {
      const nums = values
        .split(';')
        .map((v: string) => parseFloat(v.trim()))
        .filter((n: number) => !isNaN(n))
      if (nums.length > 0) {
        const min = Math.min(...nums)
        const max = Math.max(...nums)
        return `${min} – ${max} (based on ${type})`
      }
      return values
    })

    // {{pp|...formula=text...}} - per-level progression
    cleaned = cleaned.replace(/\{\{pp\|([^}]*?)formula=([^}]+)\}\}/g, '$2')

    // {{pp|min to max ...|...|key=%|color=colorname|type=text|...}} - format with color wrapper
    cleaned = cleaned.replace(
      /\{\{pp\|(\d+)\s+to\s+(\d+)\s+[^|]*\|[^|]*\|key=%\|color=([^|}]+)\|type=([^|}]+)(?:\|[^}]*)?\}\}/g,
      (match, min, max, color, type) => {
        const content = `${min}% – ${max}% (based on ${type})`
        return `<${color}>${content}</${color}>`
      }
    )

    // {{pp|key=%|0 to X for Y|range|type=text}} - format without color
    cleaned = cleaned.replace(
      /\{\{pp\|key=%\|(\d+)\s+to\s+(\d+)\s+for\s+\d+\|[^|]*\|type=([^|}]+)(?:\|[^}]*)?\}\}/g,
      (match, min, max, type) => {
        return `${min}% – ${max}% (based on ${type})`
      }
    )

    cleaned = cleaned.replace(/\{\{pp\|([^}|]+)([^}]*)\}\}/g, '$1')

    // {{tt|text|tooltip}} - show text only
    cleaned = cleaned.replace(/\{\{tt\|([^}|]+)\|([^}]*)\}\}/g, '$1')

    // {{ft|text|fallback}} - show first option
    cleaned = cleaned.replace(/\{\{ft\|([^|]+?)\|.+\}\}\}/gs, ' $1 ')

    // {{tip|keyword|icononly=true}} - icon only with special marker
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|icononly\s*=\s*true\}\}/g, '<tip>$1|||ICONONLY</tip>')

    // {{tip|keyword|display}} - use display text with keyword preserved for icon lookup
    cleaned = cleaned.replace(/\{\{tip\|([^}|]+)\|([^}]+)\}\}/g, (match, keyword, display) => {
      if (display.includes('icononly')) return match
      return `<tip>${keyword}|||${display}</tip>`
    })

    // {{tip|keyword}} - use keyword with itself as display
    cleaned = cleaned.replace(/\{\{tip\|([^}]+)\}\}/g, '<tip>$1|||$1</tip>')

    // {{sti|text}} or {{ai|text}} - stat/ability icon
    cleaned = cleaned.replace(/\{\{(?:sti|ai)\|([^}]+)\}\}/g, '<keyword>$1</keyword>')

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

      // then check for single words at the end
      const words = lower
        .replace(/[()%]/g, '')
        .trim()
        .split(/\s+/)
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

    // then process {{as|text|type}} templates (two parameters)

    // simple content first
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|true damage\}\}/g, '$1')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|magic damage\}\}/g, '<magic>$1</magic>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|physical damage\}\}/g, '<ad-bonus>$1</ad-bonus>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ad\}\}/g, '<ad>$1</ad>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|ap\}\}/g, '<ap>$1</ap>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:health|hp)\}\}/g, '<health>$1</health>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:mana|mp)\}\}/g, '<mana>$1</mana>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|armor\}\}/g, '<armor>$1</armor>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:magic resistance|mr)\}\}/g, '<mr>$1</mr>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:healing|heal|shield|shielding|hsp)\}\}/g, '<heal>$1</heal>')
    cleaned = cleaned.replace(/\{\{as\|([^}|]+)\|(?:movement speed|ms)\}\}/g, '<ms>$1</ms>')

    // nested content (with markers)
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|magic damage\}\}/g, '<magic>$1</magic>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|physical damage\}\}/g, '<ad-bonus>$1</ad-bonus>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|ap\}\}/g, '<ap>$1</ap>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:health|hp)\}\}/g, '<health>$1</health>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:mana|mp)\}\}/g, '<mana>$1</mana>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|armor\}\}/g, '<armor>$1</armor>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:magic resistance|mr)\}\}/g, '<mr>$1</mr>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:healing|heal|shield|shielding|hsp)\}\}/g, '<heal>$1</heal>')
    cleaned = cleaned.replace(/\{\{as\|(.+?)\|(?:movement speed|ms)\}\}/g, '<ms>$1</ms>')

    // remove any remaining {{}} templates
    cleaned = cleaned.replace(/\{\{([^}]+)\}\}/g, '')
  }

  // process [[link]] brackets AFTER the loop
  // [[link|text]] - show text
  cleaned = cleaned.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
  // [[on-hit]] and [[on-attack]] - convert to keyword with icon
  cleaned = cleaned.replace(/\[\[(on-hit|on-attack)\]\]/g, '<keyword>$1</keyword>')
  // [[link]] - show link
  cleaned = cleaned.replace(/\[\[([^\]]+)\]\]/g, '$1')

  // process plain text rd - add melee/ranged icons
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

  return cleaned
}
