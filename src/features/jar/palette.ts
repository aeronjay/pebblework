import type { QuestCategory } from '../../db/types'
import { resolveCategoryColor } from '../quests/meta'

export type RGB = [number, number, number]

const cache = new Map<string, RGB>()
let probe: CanvasRenderingContext2D | null | undefined

// Any CSS color (oklch(), #hex, rgb()) → sRGB bytes, by painting one pixel. Canvas gradients and
// canvas-confetti only understand hex/rgb, while the tokens are oklch().
export function toRgb(css: string): RGB {
  const hit = cache.get(css)
  if (hit) return hit
  probe ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  let out: RGB = [128, 128, 128]
  if (probe) {
    probe.clearRect(0, 0, 1, 1)
    probe.fillStyle = '#808080'
    probe.fillStyle = css
    probe.fillRect(0, 0, 1, 1)
    const d = probe.getImageData(0, 0, 1, 1).data
    out = [d[0], d[1], d[2]]
  }
  cache.set(css, out)
  return out
}

export const rgba = ([r, g, b]: RGB, a = 1) => `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${a})`
export const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

// t > 0 mixes toward white, t < 0 toward black.
export function tint([r, g, b]: RGB, t: number): RGB {
  const to = t > 0 ? 255 : 0
  const k = Math.abs(t)
  return [r + (to - r) * k, g + (to - g) * k, b + (to - b) * k]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

// The app theme (Settings → Appearance) is resolved onto <html data-theme>; fall back to the OS before it's set.
export function prefersDark(el?: Element): boolean {
  // Nearest themed ancestor: Home's jar stage is dark even when the app is light.
  const t = (el?.closest<HTMLElement>('[data-theme]') ?? document.documentElement).dataset.theme
  if (t) return t === 'dark'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export interface JarTheme {
  dark: boolean
  stones: Record<QuestCategory, RGB>
}

export function readTheme(el?: Element): JarTheme {
  const color = (c: QuestCategory) => toRgb(resolveCategoryColor(c, 'color', el) || '#999')
  return { dark: prefersDark(el), stones: { dq: color('dq'), mq: color('mq'), sq: color('sq') } }
}

// Calls back when the theme flips (tokens swap with <html data-theme>).
export function onSchemeChange(cb: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {}
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
