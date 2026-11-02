import type { Rarity } from '../../db/types'
import { mix, rgba, tint, toRgb, type JarTheme, type RGB } from './palette'
import { CORNER, JAR, WORLD, hashString, seeded, type MarbleBody, type Point } from './sim'

// Jar geometry around the physics interior (JAR). The glass is drawn slightly outside the walls.
const CX = (JAR.left + JAR.right) / 2
const IN = (JAR.right - JAR.left) / 2 // interior half width
const OUT = IN + 6 // outer glass half width
const LIP = OUT + 3 // rolled rim half width
const LIP_TOP = 14
const LIP_BOTTOM = 26
const BASE = JAR.bottom + 9 // outer bottom of the thick glass base
const ARC = 5 // perspective depth of the ellipses (mouth, base, threads)
const R_OUT = CORNER + 6

const sprites = new Map<string, HTMLCanvasElement>()

export function clearSprites() {
  sprites.clear()
}

// Darken a #rrggbb color by multiplying its channels.
function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  if (Number.isNaN(n)) return hex
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * factor)
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`
}

// Pre-rendered marble images, keyed by look and pixel size, so each frame is just drawImage.
function sprite(color: string, rarity: Rarity, px: number): HTMLCanvasElement {
  const size = Math.ceil(px)
  const key = `${color}|${rarity}|${size}`
  let c = sprites.get(key)
  if (c) return c
  c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const r = size / 2

  ctx.beginPath()
  ctx.arc(r, r, r, 0, Math.PI * 2)
  ctx.clip()

  if (rarity === 'mythic') {
    const conic = ctx.createConicGradient(0, r, r)
    ;['#f43f5e', '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6', '#f43f5e'].forEach((col, i, a) => conic.addColorStop(i / (a.length - 1), col))
    ctx.fillStyle = conic
  } else {
    const base = rarity === 'golden' ? '#f5b301' : color
    const g = ctx.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r)
    g.addColorStop(0, rarity === 'golden' ? '#fff7d1' : '#ffffffaa')
    g.addColorStop(0.35, base)
    g.addColorStop(1, rarity === 'golden' ? '#9a6b00' : shade(base, 0.65))
    ctx.fillStyle = g
  }
  ctx.fillRect(0, 0, size, size)

  // Glossy highlight.
  const hl = ctx.createRadialGradient(r * 0.65, r * 0.55, 0, r * 0.65, r * 0.55, r * 0.5)
  hl.addColorStop(0, '#ffffffcc')
  hl.addColorStop(1, '#ffffff00')
  ctx.fillStyle = hl
  ctx.fillRect(0, 0, size, size)

  sprites.set(key, c)
  return c
}

// Outer silhouette of the glass from under the rim down around the base.
function bodyPath(ctx: CanvasRenderingContext2D, half = OUT, top = LIP_BOTTOM - 2, bottom = BASE) {
  const l = CX - half
  const r = CX + half
  const rad = Math.min(R_OUT, half)
  ctx.beginPath()
  ctx.moveTo(l, top)
  ctx.lineTo(l, bottom - rad)
  ctx.quadraticCurveTo(l, bottom, l + rad, bottom + ARC * 0.4)
  ctx.quadraticCurveTo(CX, bottom + ARC * 1.6, r - rad, bottom + ARC * 0.4)
  ctx.quadraticCurveTo(r, bottom, r, bottom - rad)
  ctx.lineTo(r, top)
  ctx.closePath()
}

// Where items may be drawn: the interior, open upward through the mouth.
function interiorClip(ctx: CanvasRenderingContext2D) {
  const { left, right, bottom } = JAR
  ctx.beginPath()
  ctx.moveTo(left - 1, -WORLD.height)
  ctx.lineTo(left - 1, bottom - CORNER)
  ctx.quadraticCurveTo(left - 1, bottom + 1, left + CORNER, bottom + 1)
  ctx.lineTo(right - CORNER, bottom + 1)
  ctx.quadraticCurveTo(right + 1, bottom + 1, right + 1, bottom - CORNER)
  ctx.lineTo(right + 1, -WORLD.height)
  ctx.closePath()
}

function hGradient(ctx: CanvasRenderingContext2D, half: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(CX - half, 0, CX + half, 0)
  for (const [at, c] of stops) g.addColorStop(at, c)
  return g
}

function vStreak(ctx: CanvasRenderingContext2D, x: number, w: number, y0: number, y1: number, alpha: number) {
  const g = ctx.createLinearGradient(0, y0, 0, y1)
  g.addColorStop(0, `rgba(255,255,255,0)`)
  g.addColorStop(0.12, `rgba(255,255,255,${alpha})`)
  g.addColorStop(0.7, `rgba(255,255,255,${alpha * 0.75})`)
  g.addColorStop(1, `rgba(255,255,255,0)`)
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.roundRect(x, y0, w, y1 - y0, w / 2)
  ctx.fill()
}

export interface SceneOptions {
  theme: JarTheme
  now?: number // ms clock, for fades and glints
  glow?: number // 0..1 celebration glow
  glowColor?: RGB
  glint?: number // 0..1 progress of a shimmer sweep over rare stones, or < 0 for none
  reducedMotion?: boolean
}

function drawBack(ctx: CanvasRenderingContext2D, { theme, glow = 0, glowColor }: SceneOptions) {
  const dark = theme.dark

  // Soft contact shadow under the base.
  ctx.save()
  ctx.translate(CX, BASE + ARC + 1)
  ctx.scale(1, 0.09)
  let g = ctx.createRadialGradient(0, 0, 0, 0, 0, OUT + 26)
  g.addColorStop(0, dark ? 'rgba(0,0,0,0.75)' : 'rgba(40,30,15,0.30)')
  g.addColorStop(0.55, dark ? 'rgba(0,0,0,0.35)' : 'rgba(40,30,15,0.12)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(0, 0, OUT + 26, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Celebration glow behind the glass.
  if (glow > 0 && glowColor) {
    ctx.save()
    ctx.shadowColor = rgba(glowColor, 0.85 * glow)
    ctx.shadowBlur = 40 * glow
    bodyPath(ctx)
    ctx.fillStyle = rgba(glowColor, 0.18 * glow)
    ctx.fill()
    ctx.restore()
  }

  // Back wall: refraction gradient (edges denser than the middle), tinted a touch toward sea-glass.
  bodyPath(ctx)
  ctx.fillStyle = hGradient(
    ctx,
    OUT,
    dark
      ? [
          [0, 'rgba(200,225,235,0.14)'],
          [0.18, 'rgba(200,225,235,0.05)'],
          [0.6, 'rgba(255,255,255,0.035)'],
          [0.88, 'rgba(200,225,235,0.07)'],
          [1, 'rgba(200,225,235,0.16)'],
        ]
      : [
          [0, 'rgba(196,212,218,0.55)'],
          [0.16, 'rgba(236,244,246,0.5)'],
          [0.55, 'rgba(255,255,255,0.48)'],
          [0.86, 'rgba(232,240,243,0.5)'],
          [1, 'rgba(190,206,213,0.6)'],
        ],
  )
  ctx.fill()

  // Inner back-wall shading: darker toward the floor and in the far corners so contents sit inside.
  ctx.save()
  bodyPath(ctx, IN, JAR.top - 18, JAR.bottom)
  ctx.clip()
  g = ctx.createLinearGradient(0, JAR.top, 0, JAR.bottom)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, dark ? 'rgba(0,0,0,0.32)' : 'rgba(70,80,90,0.10)')
  ctx.fillStyle = g
  ctx.fillRect(CX - IN, JAR.top - 20, IN * 2, JAR.bottom - JAR.top + 30)
  ctx.fillStyle = hGradient(ctx, IN, [
    [0, dark ? 'rgba(0,0,0,0.28)' : 'rgba(60,75,85,0.10)'],
    [0.14, 'rgba(0,0,0,0)'],
    [0.86, 'rgba(0,0,0,0)'],
    [1, dark ? 'rgba(0,0,0,0.28)' : 'rgba(60,75,85,0.10)'],
  ])
  ctx.fillRect(CX - IN, JAR.top - 20, IN * 2, JAR.bottom - JAR.top + 30)
  // A faint caustic on the back wall where light passes through the far side.
  vStreak(ctx, CX + IN * 0.42, 18, JAR.top + 10, JAR.bottom - 20, dark ? 0.035 : 0.28)
  ctx.restore()

  // Floor of the jar seen slightly from above.
  ctx.beginPath()
  ctx.ellipse(CX, JAR.bottom - 1, IN - 4, ARC, 0, 0, Math.PI * 2)
  ctx.fillStyle = dark ? 'rgba(0,0,0,0.25)' : 'rgba(120,135,145,0.10)'
  ctx.fill()

  // Back half of the mouth.
  ctx.beginPath()
  ctx.ellipse(CX, LIP_TOP + 3, LIP - 3, ARC, 0, Math.PI, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(110,125,135,0.22)'
  ctx.stroke()
}

function drawFront(ctx: CanvasRenderingContext2D, { theme, glow = 0, glowColor }: SceneOptions) {
  const dark = theme.dark

  // Fresnel: the glass thickens toward the silhouette, so the sides read lighter and more opaque.
  bodyPath(ctx)
  ctx.fillStyle = hGradient(
    ctx,
    OUT,
    dark
      ? [
          [0, 'rgba(255,255,255,0.10)'],
          [0.08, 'rgba(255,255,255,0.03)'],
          [0.25, 'rgba(255,255,255,0)'],
          [0.8, 'rgba(255,255,255,0)'],
          [0.94, 'rgba(255,255,255,0.03)'],
          [1, 'rgba(255,255,255,0.09)'],
        ]
      : [
          [0, 'rgba(255,255,255,0.55)'],
          [0.07, 'rgba(255,255,255,0.18)'],
          [0.22, 'rgba(255,255,255,0.03)'],
          [0.8, 'rgba(255,255,255,0.02)'],
          [0.95, 'rgba(255,255,255,0.16)'],
          [1, 'rgba(255,255,255,0.45)'],
        ],
  )
  ctx.fill()

  // Thick glass base: a refracting slab with a bright lower edge.
  ctx.save()
  bodyPath(ctx)
  ctx.clip()
  let g = ctx.createLinearGradient(0, JAR.bottom - 2, 0, BASE + ARC * 1.6)
  g.addColorStop(0, dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)')
  g.addColorStop(0.45, dark ? 'rgba(160,190,200,0.06)' : 'rgba(190,208,214,0.45)')
  g.addColorStop(1, dark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.8)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(CX - OUT, JAR.bottom - 2)
  ctx.quadraticCurveTo(CX, JAR.bottom + ARC * 1.4, CX + OUT, JAR.bottom - 2)
  ctx.lineTo(CX + OUT, BASE + 20)
  ctx.lineTo(CX - OUT, BASE + 20)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // Silhouette and the inner edge of the wall.
  bodyPath(ctx)
  ctx.lineWidth = 1.25
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(80,92,100,0.38)'
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(CX - IN, LIP_BOTTOM + 2)
  ctx.lineTo(CX - IN, JAR.bottom - CORNER)
  ctx.quadraticCurveTo(CX - IN, JAR.bottom, CX - IN + CORNER, JAR.bottom + ARC * 0.4)
  ctx.quadraticCurveTo(CX, JAR.bottom + ARC * 1.4, CX + IN - CORNER, JAR.bottom + ARC * 0.4)
  ctx.quadraticCurveTo(CX + IN, JAR.bottom, CX + IN, JAR.bottom - CORNER)
  ctx.lineTo(CX + IN, LIP_BOTTOM + 2)
  ctx.lineWidth = 1
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)'
  ctx.stroke()

  // Specular streaks: one broad + one hairline on the lit side, a narrow one on the far side.
  const hi = dark ? 0.55 : 1
  vStreak(ctx, CX - OUT + 10, 9, JAR.top + 4, JAR.bottom - 40, 0.5 * hi)
  vStreak(ctx, CX - OUT + 23, 2.5, JAR.top + 26, JAR.bottom - 90, 0.42 * hi)
  vStreak(ctx, CX + OUT - 15, 4, JAR.top + 30, JAR.bottom - 120, 0.3 * hi)
  // Highlight following the lit bottom corner.
  ctx.beginPath()
  ctx.moveTo(CX - OUT + 4, BASE - R_OUT)
  ctx.quadraticCurveTo(CX - OUT + 5, BASE - 1, CX - OUT + R_OUT + 6, BASE + ARC * 0.3)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.strokeStyle = `rgba(255,255,255,${dark ? 0.16 : 0.55})`
  ctx.stroke()

  // Neck threads: two ridges wrapping round the front, faintly slanted.
  for (const y of [LIP_BOTTOM + 6, LIP_BOTTOM + 13]) {
    ctx.beginPath()
    ctx.moveTo(CX - OUT + 1, y - 1.5)
    ctx.quadraticCurveTo(CX, y + ARC * 1.6, CX + OUT - 1, y + 1.5)
    ctx.lineWidth = 2.2
    ctx.strokeStyle = dark ? 'rgba(0,0,0,0.35)' : 'rgba(90,105,115,0.16)'
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(CX - OUT + 2, y - 2.6)
    ctx.quadraticCurveTo(CX, y + ARC * 1.6 - 1.2, CX + OUT - 2, y + 0.4)
    ctx.lineWidth = 1
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.9)'
    ctx.stroke()
  }

  // Rolled rim.
  ctx.beginPath()
  ctx.roundRect(CX - LIP, LIP_TOP, LIP * 2, LIP_BOTTOM - LIP_TOP, 6)
  g = ctx.createLinearGradient(0, LIP_TOP, 0, LIP_BOTTOM)
  if (dark) {
    g.addColorStop(0, 'rgba(255,255,255,0.22)')
    g.addColorStop(0.45, 'rgba(255,255,255,0.07)')
    g.addColorStop(1, 'rgba(255,255,255,0.12)')
  } else {
    g.addColorStop(0, 'rgba(255,255,255,0.95)')
    g.addColorStop(0.5, 'rgba(214,226,231,0.75)')
    g.addColorStop(1, 'rgba(236,243,245,0.9)')
  }
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(80,92,100,0.32)'
  ctx.stroke()
  ctx.fillStyle = hGradient(ctx, LIP, [
    [0, 'rgba(255,255,255,0)'],
    [0.12, `rgba(255,255,255,${0.7 * hi})`],
    [0.3, 'rgba(255,255,255,0)'],
    [0.85, 'rgba(255,255,255,0)'],
    [0.93, `rgba(255,255,255,${0.35 * hi})`],
    [1, 'rgba(255,255,255,0)'],
  ])
  ctx.fillRect(CX - LIP + 2, LIP_TOP + 2, LIP * 2 - 4, 3)

  // Front edge of the mouth.
  ctx.beginPath()
  ctx.ellipse(CX, LIP_TOP + 3, LIP - 3, ARC, 0, 0, Math.PI)
  ctx.lineWidth = 1.25
  ctx.strokeStyle = dark ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.95)'
  ctx.stroke()

  if (glow > 0 && glowColor) {
    ctx.save()
    ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
    bodyPath(ctx)
    ctx.lineWidth = 2
    ctx.strokeStyle = rgba(tint(glowColor, 0.4), 0.7 * glow)
    ctx.stroke()
    ctx.restore()
  }
}

interface StoneLook {
  base: RGB
  speckles: { x: number; y: number; r: number; light: boolean }[]
}

const looks = new Map<string, StoneLook>()

function lookFor(body: MarbleBody, theme: JarTheme): StoneLook {
  const m = body.marble
  const key = `${m.id}|${theme.dark ? 1 : 0}|${m.category}`
  let look = looks.get(key)
  if (look) return look
  const rng = seeded(hashString(m.id) ^ 0x9e3779b9)
  const cat = m.category ? theme.stones[m.category] : m.color ? toRgb(m.color) : ([150, 150, 150] as RGB)
  // Natural variation: each stone a little lighter/darker and a touch earthier than the token.
  const earthy: RGB = theme.dark ? [70, 66, 60] : [150, 140, 125]
  let base = mix(tint(cat, (rng() - 0.5) * 0.2 + (theme.dark ? -0.06 : -0.02)), earthy, 0.12 + rng() * 0.14)
  if (m.rarity === 'golden') base = mix([240, 192, 80], [222, 168, 56], rng())
  const e = body.extent
  const speckles = Array.from({ length: 8 + Math.floor(rng() * 8) }, () => {
    const a = rng() * Math.PI * 2
    const d = Math.sqrt(rng()) * e * 0.75
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r: e * (0.012 + rng() * 0.022), light: rng() < 0.4 }
  })
  look = { base, speckles }
  looks.set(key, look)
  return look
}

function stonePath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  const n = pts.length
  const mid = (i: number) => {
    const a = pts[i % n]
    const b = pts[(i + 1) % n]
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  }
  const start = mid(n - 1)
  ctx.beginPath()
  ctx.moveTo(start.x, start.y)
  for (let i = 0; i < n; i++) {
    const m = mid(i)
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y)
  }
  ctx.closePath()
}

const OPAL = ['#ffd1dc', '#ffe8b0', '#c8f7dc', '#bfe7ff', '#e0ccff', '#ffd1dc']

function drawStone(ctx: CanvasRenderingContext2D, body: MarbleBody, opts: SceneOptions) {
  const { theme, now = 0 } = opts
  const look = lookFor(body, theme)
  const e = body.extent
  const rarity = body.marble.rarity
  let alpha = 1
  let sink = 0
  let scale = 1.05 // rounded corners pull the outline in; make up for it
  if (body.fade) {
    const t = Math.min(1, Math.max(0, (now - body.fade.start) / body.fade.ms))
    const ease = t * t
    alpha = 1 - ease
    sink = 16 * ease
    scale *= 1 - 0.25 * ease
    if (alpha <= 0) return
  }

  const cos = Math.cos(body.angle)
  const sin = Math.sin(body.angle)
  const pts = body.outline!.map((p) => ({ x: (p.x * cos - p.y * sin) * scale, y: (p.x * sin + p.y * cos) * scale }))

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(body.position.x, body.position.y + sink)

  // Body with light from the upper left (world frame, so it doesn't spin with the stone).
  const base = look.base
  stonePath(ctx, pts)
  const g = ctx.createRadialGradient(-e * 0.35, -e * 0.45, e * 0.05, -e * 0.1, -e * 0.1, e * 1.35)
  const special = rarity !== 'normal'
  g.addColorStop(0, rgba(tint(base, special ? 0.55 : 0.3)))
  g.addColorStop(0.45, rgba(base))
  g.addColorStop(1, rgba(tint(base, theme.dark ? -0.55 : -0.42)))
  ctx.fillStyle = g
  ctx.fill()

  ctx.save()
  ctx.clip()
  if (rarity === 'mythic') {
    const conic = ctx.createConicGradient(body.angle, 0, 0)
    OPAL.forEach((c, i) => conic.addColorStop(i / (OPAL.length - 1), c))
    ctx.globalAlpha = alpha * 0.55
    ctx.fillStyle = conic
    ctx.fillRect(-e, -e, e * 2, e * 2)
    ctx.globalAlpha = alpha
  }
  // Mineral speckles rotate with the stone.
  for (const s of look.speckles) {
    ctx.beginPath()
    ctx.arc(s.x * cos - s.y * sin, s.x * sin + s.y * cos, s.r, 0, Math.PI * 2)
    ctx.fillStyle = s.light ? 'rgba(255,255,255,0.14)' : rgba(tint(base, -0.5), special ? 0.06 : 0.14)
    ctx.fill()
  }
  if (rarity === 'golden') {
    // Brushed-metal banding so a golden stone reads as gilded, not just amber.
    const band = ctx.createLinearGradient(-e, -e, e, e)
    band.addColorStop(0, 'rgba(120,80,10,0.35)')
    band.addColorStop(0.32, 'rgba(255,246,210,0.55)')
    band.addColorStop(0.48, 'rgba(200,140,30,0.15)')
    band.addColorStop(0.62, 'rgba(255,240,190,0.45)')
    band.addColorStop(1, 'rgba(110,70,10,0.4)')
    ctx.fillStyle = band
    ctx.fillRect(-e, -e, e * 2, e * 2)
  }
  // Ambient occlusion on the shadow side.
  const ao = ctx.createRadialGradient(e * 0.25, e * 0.35, e * 0.3, e * 0.25, e * 0.35, e * 1.1)
  ao.addColorStop(0, 'rgba(0,0,0,0)')
  ao.addColorStop(1, `rgba(0,0,0,${theme.dark ? 0.3 : 0.16})`)
  ctx.fillStyle = ao
  ctx.fillRect(-e * 1.2, -e * 1.2, e * 2.4, e * 2.4)
  // Soft, matte sheen (stronger and crisper on rare stones).
  const hl = ctx.createRadialGradient(-e * 0.32, -e * 0.42, 0, -e * 0.32, -e * 0.42, e * (special ? 0.5 : 0.55))
  hl.addColorStop(0, `rgba(255,255,255,${special ? 0.75 : theme.dark ? 0.2 : 0.26})`)
  hl.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = hl
  ctx.fillRect(-e, -e, e * 2, e * 2)
  // A shimmer band sweeping across golden/mythic stones.
  const glint = opts.glint ?? -1
  if (special && glint >= 0 && glint <= 1) {
    const x = -e * 1.6 + glint * e * 3.2
    const band = ctx.createLinearGradient(x - e * 0.4, -e, x + e * 0.4, e)
    band.addColorStop(0, 'rgba(255,255,255,0)')
    band.addColorStop(0.5, 'rgba(255,255,255,0.7)')
    band.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = band
    ctx.fillRect(-e * 1.2, -e * 1.2, e * 2.4, e * 2.4)
  }
  ctx.restore()

  // Crisp edge so neighbouring stones separate, plus a thin rim light along the top.
  ctx.lineWidth = 0.7
  ctx.strokeStyle = rgba(tint(base, -0.6), theme.dark ? 0.5 : 0.28)
  ctx.stroke()
  const rim = ctx.createLinearGradient(0, -e, 0, e * 0.2)
  rim.addColorStop(0, `rgba(255,255,255,${special ? 0.6 : 0.3})`)
  rim.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.lineWidth = 0.9
  ctx.strokeStyle = rim
  ctx.stroke()

  // A tiny four-point sparkle on rare stones.
  if (special) {
    const tw = glint >= 0 && glint <= 1 ? Math.sin(glint * Math.PI) : opts.reducedMotion ? 0.6 : 0.35
    const sx = -e * 0.38
    const sy = -e * 0.48
    const s = e * 0.32 * tw
    ctx.fillStyle = `rgba(255,255,255,${0.9 * tw})`
    ctx.beginPath()
    ctx.moveTo(sx, sy - s)
    ctx.quadraticCurveTo(sx, sy, sx + s * 0.6, sy)
    ctx.quadraticCurveTo(sx, sy, sx, sy + s)
    ctx.quadraticCurveTo(sx, sy, sx - s * 0.6, sy)
    ctx.quadraticCurveTo(sx, sy, sx, sy - s)
    ctx.fill()
  }
  ctx.restore()
}

function drawMarble(ctx: CanvasRenderingContext2D, b: MarbleBody, scale: number) {
  const r = b.circleRadius || 10
  const img = sprite(b.marble.color ?? '#999999', b.marble.rarity, r * 2 * scale)
  ctx.save()
  ctx.translate(b.position.x, b.position.y)
  ctx.rotate(b.marble.rarity === 'mythic' ? b.angle : 0)
  ctx.drawImage(img, -r, -r, r * 2, r * 2)
  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, bodies: Iterable<MarbleBody>, scale: number, opts: SceneOptions) {
  const { width, height } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  drawBack(ctx, opts)
  ctx.save()
  interiorClip(ctx)
  ctx.clip()
  for (const b of bodies) {
    if (b.outline) drawStone(ctx, b, opts)
    else drawMarble(ctx, b, scale)
  }
  ctx.restore()
  drawFront(ctx, opts)
}

const FALLBACK: JarTheme['stones'] = { dq: [80, 180, 140], mq: [230, 180, 80], sq: [150, 120, 220] }

// Goal jar (JarView): same glass, round marbles.
export function drawJar(ctx: CanvasRenderingContext2D, bodies: Iterable<MarbleBody>, scale: number, dark: boolean) {
  drawScene(ctx, bodies, scale, { theme: { dark, stones: FALLBACK } })
}
