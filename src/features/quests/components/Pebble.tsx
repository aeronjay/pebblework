// oxlint-disable react/only-export-components -- exports a lookup of stateless SVG components; fast refresh just remounts them.
import type { SVGProps } from 'react'
import type { QuestCategory } from '../../../db/types'

// Each quest type is marked by the stone it drops into the jar: a different shape per type (so it never relies on
// color alone), filled with that type's color, with a soft top-left highlight. strokeWidth is accepted (call sites
// pass it, as they would to a line icon) and ignored.
const SHAPE: Record<QuestCategory, { d: string; hi: string }> = {
  // Daily: a small, round river pebble.
  dq: {
    d: 'M12 5.6c4 0 6.9 2.6 6.9 6.2 0 3.9-3 6.6-7.1 6.6-4.2 0-6.7-2.6-6.7-6.2C5.1 8.3 8 5.6 12 5.6z',
    hi: 'M8.4 10.2c.5-1.4 1.9-2.4 3.6-2.6',
  },
  // Main: the big, long stone.
  mq: {
    d: 'M3.6 13.8c-.5-3.7 2.7-7 7.9-7.7 5-.7 8.4 1.4 8.8 4.7.3 3.7-2.8 6.8-7.8 7.5-4.8.6-8.4-1.2-8.9-4.5z',
    hi: 'M6.9 11.1c1-1.4 2.8-2.3 4.8-2.6',
  },
  // Side: a flat, skipping stone.
  sq: {
    d: 'M4.4 14.3c-.3-2.4 2-4.6 5.6-5.5 3.9-1 7.8-.4 8.8 1.8.9 2.4-1.6 5-5.7 5.9-4.4.9-8.4.2-8.7-2.2z',
    hi: 'M7.6 12.2c.9-.9 2.2-1.5 3.8-1.8',
  },
}

type PebbleProps = Omit<SVGProps<SVGSVGElement>, 'strokeWidth'> & { strokeWidth?: number; size?: number }

function make(category: QuestCategory) {
  const s = SHAPE[category]
  function Pebble({ strokeWidth: _ignored, size, ...props }: PebbleProps) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} {...props}>
        <path d={s.d} fill={`var(--color-${category})`} />
        <path d={s.hi} fill="none" stroke="white" strokeOpacity={0.45} strokeWidth={1.4} strokeLinecap="round" />
      </svg>
    )
  }
  Pebble.displayName = `Pebble(${category})`
  return Pebble
}

export const PEBBLE = { dq: make('dq'), mq: make('mq'), sq: make('sq') }
export type PebbleIcon = ReturnType<typeof make>
