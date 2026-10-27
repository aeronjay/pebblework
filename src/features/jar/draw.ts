import type { Rarity } from '../../db/types'
import { JAR, type MarbleBody } from './sim'

const sprites = new Map<string, HTMLCanvasElement>()

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

function jarPath(ctx: CanvasRenderingContext2D) {
  const { left, right, top, bottom } = JAR
  const pad = 6
  const r = 26
  ctx.beginPath()
  ctx.moveTo(left - pad, top - 8)
  ctx.lineTo(left - pad, bottom + pad - r)
  ctx.quadraticCurveTo(left - pad, bottom + pad, left - pad + r, bottom + pad)
  ctx.lineTo(right + pad - r, bottom + pad)
  ctx.quadraticCurveTo(right + pad, bottom + pad, right + pad, bottom + pad - r)
  ctx.lineTo(right + pad, top - 8)
}

export function drawJar(ctx: CanvasRenderingContext2D, bodies: Iterable<MarbleBody>, scale: number, dark: boolean) {
  const { width, height } = ctx.canvas
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, width, height)
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // Glass back.
  jarPath(ctx)
  ctx.closePath()
  ctx.fillStyle = dark ? '#ffffff0d' : '#ffffff99'
  ctx.fill()

  for (const b of bodies) {
    const r = b.circleRadius ?? 10
    const img = sprite(b.marble.color, b.marble.rarity, r * 2 * scale)
    ctx.save()
    ctx.translate(b.position.x, b.position.y)
    ctx.rotate(b.marble.rarity === 'mythic' ? b.angle : 0)
    ctx.drawImage(img, -r, -r, r * 2, r * 2)
    ctx.restore()
  }

  // Glass front: outline, reflection and rim.
  jarPath(ctx)
  ctx.lineWidth = 4
  ctx.strokeStyle = dark ? '#e7e5e455' : '#78716c66'
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(JAR.left + 10, JAR.top + 20)
  ctx.lineTo(JAR.left + 10, JAR.bottom - 30)
  ctx.lineWidth = 6
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#ffffff40'
  ctx.stroke()

  ctx.fillStyle = dark ? '#e7e5e433' : '#78716c33'
  ctx.beginPath()
  ctx.roundRect(JAR.left - 14, JAR.top - 18, JAR.right - JAR.left + 28, 12, 6)
  ctx.fill()
}
