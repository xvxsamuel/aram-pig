// shared tooltip utilities for rendering formatted descriptions

const KEYWORD_ICON_MAP = new Map<string, string>([
  // status effects
  ['slow', '/icons/tooltips/slow_icon.png'],
  ['slowing', '/icons/tooltips/slow_icon.png'],
  ['slows', '/icons/tooltips/slow_icon.png'],
  ['stun', '/icons/tooltips/stun_icon.png'],
  ['stuns', '/icons/tooltips/stun_icon.png'],
  ['stunned', '/icons/tooltips/stun_icon.png'],
  ['immobilize', '/icons/tooltips/stun_icon.png'],
  ['immobilizing', '/icons/tooltips/stun_icon.png'],
  ['immobilized', '/icons/tooltips/stun_icon.png'],
  ['cripple', '/icons/tooltips/cripple_icon.png'],
  ['crippling', '/icons/tooltips/cripple_icon.png'],
  ['crippled', '/icons/tooltips/cripple_icon.png'],
  ['stasis', '/icons/tooltips/stasis_icon.png'],
  ['stasis (buff)', '/icons/tooltips/stasis_icon.png'],
  ['untargetable', '/icons/tooltips/untargetable_icon.png'],
  ['invulnerable', '/icons/tooltips/taric_cosmic_radiance.png'],
  // unit types
  ['melee', '/icons/tooltips/melee_role_icon.png'],
  ['ranged', '/icons/tooltips/ranged_role_icon.png'],
  ['minions', '/icons/tooltips/minion_icon.png'],
  ['minion', '/icons/tooltips/minion_icon.png'],
  ['monsters', '/icons/tooltips/monster_icon.png'],
  ['monster', '/icons/tooltips/monster_icon.png'],
  // attack/damage types
  ['on-hit', '/icons/tooltips/on-hit_icon.png'],
  ['on-attack', '/icons/tooltips/on-attack_icon.png'],
  ['critical strike', '/icons/tooltips/critical_strike_icon.png'],
  ['critically strikes', '/icons/tooltips/critical_strike_icon.png'],
  ['takedown', '/icons/tooltips/damage_rating.png'],
  ['takedowns', '/icons/tooltips/damage_rating.png'],
  // healing/shielding
  ['heal', '/icons/tooltips/heal_power_icon.png'],
  ['healing', '/icons/tooltips/heal_power_icon.png'],
  ['healed', '/icons/tooltips/heal_power_icon.png'],
  ['shield', '/icons/tooltips/hybrid_resistances_icon.png'],
  ['shielding', '/icons/tooltips/hybrid_resistances_icon.png'],
  ['spell shield', '/icons/tooltips/sivir_spell_shield.png'],
  ['life steal', '/icons/tooltips/lifesteal_icon.png'],
  // vision
  ['sight', '/icons/tooltips/sight_icon.png'],
  ['stealth ward', '/icons/tooltips/stealth_ward_icon.png'],
  // range indicator
  ['cr', '/icons/tooltips/range_center.png'],
  ['er', '/icons/tooltips/range_center.png'],
])

function getKeywordIcon(keyword: string): string | null {
  return KEYWORD_ICON_MAP.get(keyword.toLowerCase().trim()) || null
}

const MARKER_REGEX =
  /(<ap>(?:(?!<\/ap>).)*<\/ap>|<rd>(?:(?!<\/rd>).)*<\/rd>|<gold>(?:(?!<\/gold>).)*<\/gold>|<vamp>(?:(?!<\/vamp>).)*<\/vamp>|<tip>(?:(?!<\/tip>).)*<\/tip>|<keyword>(?:(?!<\/keyword>).)*<\/keyword>|<ad>(?:(?!<\/ad>).)*<\/ad>|<ad-bonus>(?:(?!<\/ad-bonus>).)*<\/ad-bonus>|<health>(?:(?!<\/health>).)*<\/health>|<mana>(?:(?!<\/mana>).)*<\/mana>|<armor>(?:(?!<\/armor>).)*<\/armor>|<mr>(?:(?!<\/mr>).)*<\/mr>|<heal>(?:(?!<\/heal>).)*<\/heal>|<ms>(?:(?!<\/ms>).)*<\/ms>|<magic>(?:(?!<\/magic>).)*<\/magic>|<bold>(?:(?!<\/bold>).)*<\/bold>|<italic>(?:(?!<\/italic>).)*<\/italic>)/g

export function renderNestedMarkers(text: string, baseKey: number): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const segments = text.split(MARKER_REGEX)

  let key = 0
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue

    const keyStr = `${baseKey}-${key++}`

    if (segment.startsWith('<ap>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ap)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<rd>')) {
      parts.push(
        <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<gold>')) {
      const content = segment.slice(6, -7)
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-gold)', whiteSpace: 'nowrap' }}>
          <img
            src="/icons/tooltips/gold_colored_icon.png"
            alt=""
            className="inline h-[1em] w-auto align-baseline mr-0.5"
          />
          {content}
        </span>
      )
    } else if (segment.startsWith('<magic>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-magic)' }}>
          {renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ad>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ad)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ad-bonus>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ad-bonus)' }}>
          {renderNestedMarkers(segment.slice(10, -11), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<health>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-health)' }}>
          {renderNestedMarkers(segment.slice(8, -9), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<mana>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-mana)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<armor>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-armor)' }}>
          {renderNestedMarkers(segment.slice(7, -8), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<mr>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-mr)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<heal>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-heal)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<vamp>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-vamp)' }}>
          {renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<ms>')) {
      parts.push(
        <span key={keyStr} style={{ color: 'var(--tooltip-ms)' }}>
          {renderNestedMarkers(segment.slice(4, -5), baseKey * 1000)}
        </span>
      )
    } else if (segment.startsWith('<tip>')) {
      const content = segment.slice(5, -6)
      const tipParts = content.split('|||')
      if (tipParts.length === 2) {
        const [tipKeyword, displayText] = tipParts
        const icon = getKeywordIcon(tipKeyword)
        const isIconOnly = displayText === 'ICONONLY'

        if (icon) {
          if (isIconOnly) {
            parts.push(
              <img key={keyStr} src={icon} alt={tipKeyword} className="inline h-[1em] w-auto align-baseline" />
            )
          } else {
            parts.push(
              <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
                <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
                {displayText}
              </span>
            )
          }
        } else {
          parts.push(<span key={keyStr}>{isIconOnly ? '' : displayText}</span>)
        }
      } else {
        parts.push(<span key={keyStr}>{content}</span>)
      }
    } else if (segment.startsWith('<keyword>')) {
      const content = segment.slice(9, -10)
      const icon = getKeywordIcon(content)
      if (icon) {
        parts.push(
          <span key={keyStr} style={{ whiteSpace: 'nowrap' }}>
            <img src={icon} alt="" className="inline h-[1em] w-auto align-baseline mr-0.5" />
            {content}
          </span>
        )
      } else {
        parts.push(
          <span key={keyStr} className="text-gold-light">
            {content}
          </span>
        )
      }
    } else if (segment.startsWith('<bold>')) {
      parts.push(<strong key={keyStr}>{renderNestedMarkers(segment.slice(6, -7), baseKey * 1000)}</strong>)
    } else if (segment.startsWith('<italic>')) {
      parts.push(<em key={keyStr}>{renderNestedMarkers(segment.slice(8, -9), baseKey * 1000)}</em>)
    } else {
      parts.push(segment)
    }
  }

  return parts
}
