import { useId, useMemo } from 'react'
import type { Rarity } from '../../db/types'
import { layoutPebbles } from './model'
import type { ShelfJar } from './model'

// A small, still jar for the shelf: the same glass silhouette as Home's jar, its stones laid in rows by drop order.
// Colors come from the theme tokens, so it follows light and dark without redrawing.
const VIEW = { w: 120, h: 150 }
const IN = { x: 16, y: 34, w: 88, h: 104 } // interior the stones may occupy
const R = 14 // inner bottom corner radius

const interior = `M${IN.x} ${IN.y - 30}V${IN.y + IN.h - R}Q${IN.x} ${IN.y + IN.h} ${IN.x + R} ${IN.y + IN.h}H${IN.x + IN.w - R}Q${IN.x + IN.w} ${IN.y + IN.h} ${IN.x + IN.w} ${IN.y + IN.h - R}V${IN.y - 30}Z`

function fillFor(category: string, rarity: Rarity, gradId: string): string {
  if (rarity === 'golden') return '#e2b33c'
  if (rarity === 'mythic') return `url(#${gradId})`
  return `var(--color-${category})`
}

// `sealed` puts the lid on (a filled jar); the jar filling now stays open.
export function JarFigure({ jar, capacity, sealed = true, className = '' }: { jar: ShelfJar | null; capacity: number; sealed?: boolean; className?: string }) {
  const gradId = useId()
  const clipId = useId()
  const pebbles = useMemo(() => (jar ? layoutPebbles(jar.stones, capacity, IN.w, IN.h) : []), [jar, capacity])
  return (
    <svg aria-hidden viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} className={className}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          {['#f43f5e', '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6'].map((c, i) => (
            <stop key={c} offset={i / 4} stopColor={c} />
          ))}
        </linearGradient>
        <clipPath id={clipId}>
          <path d={interior} />
        </clipPath>
      </defs>

      {/* contact shadow */}
      <ellipse cx={VIEW.w / 2} cy={IN.y + IN.h + 8} rx={50} ry={3.2} fill="var(--color-ink)" opacity={0.12} />
      {/* glass body */}
      <path
        d={`M${IN.x - 4} ${IN.y - 10}V${IN.y + IN.h - R}Q${IN.x - 4} ${IN.y + IN.h + 5} ${IN.x + R} ${IN.y + IN.h + 5}H${IN.x + IN.w - R}Q${IN.x + IN.w + 4} ${IN.y + IN.h + 5} ${IN.x + IN.w + 4} ${IN.y + IN.h - R}V${IN.y - 10}`}
        fill="var(--color-jar)"
        stroke="var(--color-line-strong)"
        strokeWidth={1.5}
      />

      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${IN.x} ${IN.y})`}>
          {pebbles.map((p) => (
            <g key={p.id} transform={`translate(${p.x} ${p.y}) rotate(${p.rotate})`}>
              <ellipse rx={p.rx} ry={p.ry} fill={fillFor(p.category, p.rarity, gradId)} />
              <path
                d={`M${-p.rx * 0.55} ${-p.ry * 0.15}Q${-p.rx * 0.35} ${-p.ry * 0.65} ${p.rx * 0.1} ${-p.ry * 0.62}`}
                fill="none"
                stroke="white"
                strokeOpacity={p.rarity === 'normal' ? 0.4 : 0.7}
                strokeWidth={Math.max(0.8, p.ry * 0.22)}
                strokeLinecap="round"
              />
            </g>
          ))}
        </g>
      </g>

      {/* glass highlight and rim */}
      <path d={`M${IN.x + 4} ${IN.y + 2}V${IN.y + IN.h - 22}`} stroke="white" strokeOpacity={0.35} strokeWidth={3} strokeLinecap="round" />
      {sealed ? (
        <>
          <rect x={IN.x - 7} y={IN.y - 22} width={IN.w + 14} height={12} rx={4} fill="var(--color-sunken)" stroke="var(--color-line-strong)" strokeWidth={1.5} />
          <path d={`M${IN.x - 3} ${IN.y - 16}H${IN.x + IN.w + 3}`} stroke="var(--color-line-strong)" strokeWidth={1} />
        </>
      ) : (
        <rect x={IN.x - 6} y={IN.y - 13} width={IN.w + 12} height={5} rx={2.5} fill="none" stroke="var(--color-line-strong)" strokeWidth={1.5} />
      )}
    </svg>
  )
}
