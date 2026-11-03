import { clearSprites, drawScene } from './draw'
import { onSchemeChange, prefersReducedMotion, readTheme, type JarTheme, type RGB } from './palette'
import { JAR, JarSim, WORLD, type MarbleBody, type SimMarble } from './sim'

const GLOW_MS = 1800
const GLINT_MS = 1100
const FADE_MS = 620
const RATTLE_MS = 1400 // after a shake, stones knocking together clink
const MAX_JOLT = 6 // world units per frame² the stones can be thrown by in one frame

// Imperative owner of one canvas: simulation, render loop, theme, and the celebration/empty effects.
// The React side drives it step by step so a claim can play out (drop → fill → empty → overflow) even
// though the database already shows the next jar.
export class JarStage {
  sim: JarSim
  jarId: string | null = null
  onImpact?: (speed: number, body: MarbleBody) => void

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly ro: ResizeObserver
  private readonly offScheme: () => void
  private theme: JarTheme
  private scale = 1
  private raf = 0
  private dirty = true
  private frozen = false // during the empty-out, bodies stop simulating
  private glowAt = -Infinity
  private glowColor: RGB = [255, 210, 120]
  private glintAt = -Infinity
  private nextGlint = 0
  private waiters: { resolve: () => void; until: number }[] = []
  private offset = { x: 0, y: 0 } // where the jar is drawn relative to its rest spot (world units), e.g. while dragged
  private lastOffset = { x: 0, y: 0 }
  private lastVel = { x: 0, y: 0 }
  private rattleUntil = -Infinity

  constructor(canvas: HTMLCanvasElement, capacity: number) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
    this.theme = readTheme(canvas)
    this.sim = this.makeSim(capacity)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(canvas)
    this.resize()
    this.offScheme = onSchemeChange(() => {
      clearSprites()
      // Tokens swap in the same task as the media query; read them on the next frame.
      requestAnimationFrame(() => {
        this.theme = readTheme(this.canvas)
        this.dirty = true
      })
    })
    this.raf = requestAnimationFrame(this.frame)
  }

  private makeSim(capacity: number): JarSim {
    const sim = new JarSim(capacity)
    sim.onImpact = (speed, body) => this.onImpact?.(speed, body)
    sim.onKnock = (speed, body) => {
      if (performance.now() < this.rattleUntil) this.onImpact?.(speed * 0.6, body)
    }
    return sim
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1
    const w = this.canvas.clientWidth
    if (!w) return
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round((w * WORLD.height * dpr) / WORLD.width)
    this.scale = this.canvas.width / WORLD.width
    this.dirty = true
  }

  private frame = (t: number) => {
    const sim = this.sim
    this.applyInertia()
    let active = false
    if (!this.frozen && !sim.resting) {
      sim.step()
      active = true
    }
    let fading = false
    for (const b of sim.bodies.values()) if (b.fade) fading = true
    const glow = this.glowAt === -Infinity ? 0 : envelope((t - this.glowAt) / GLOW_MS)
    if (glow <= 0 && t - this.glowAt > GLOW_MS) this.glowAt = -Infinity

    // Occasional shimmer over golden/mythic stones; never a constant 60fps loop.
    let glint = (t - this.glintAt) / GLINT_MS
    if (glint > 1 && t > this.nextGlint && !prefersReducedMotion() && this.hasRare()) {
      this.glintAt = t
      this.nextGlint = t + GLINT_MS + 4200 + Math.random() * 2500
      glint = 0
    }
    const glinting = glint >= 0 && glint <= 1

    if (active || fading || glow > 0 || glinting || this.dirty) {
      drawScene(this.ctx, sim.bodies.values(), this.scale, {
        theme: this.theme,
        now: t,
        glow,
        glowColor: this.glowColor,
        glint: glinting ? glint : -1,
        reducedMotion: prefersReducedMotion(),
      })
      this.dirty = glinting // draw one more frame after the sweep ends
    }

    if (this.waiters.length) {
      const done = sim.resting || this.frozen
      this.waiters = this.waiters.filter((w) => {
        if (done || t > w.until) w.resolve()
        else return true
        return false
      })
    }
    this.raf = requestAnimationFrame(this.frame)
  }

  // The stones feel the jar's acceleration as an opposite push (they lag behind as it moves).
  private applyInertia() {
    const vx = this.offset.x - this.lastOffset.x
    const vy = this.offset.y - this.lastOffset.y
    const ax = vx - this.lastVel.x
    const ay = vy - this.lastVel.y
    this.lastOffset = { ...this.offset }
    this.lastVel = { x: vx, y: vy }
    if (this.frozen || Math.hypot(ax, ay) < 0.25) return
    const clamp = (v: number) => Math.max(-MAX_JOLT, Math.min(MAX_JOLT, v))
    this.sim.jolt(clamp(-ax * 1.2), clamp(-ay * 1.2))
    this.rattleUntil = performance.now() + RATTLE_MS
  }

  private hasRare(): boolean {
    for (const b of this.sim.bodies.values()) if (b.marble.rarity !== 'normal') return true
    return false
  }

  get capacity() {
    return this.sim.capacity
  }

  get count() {
    return this.sim.bodies.size
  }

  // Fresh, empty jar of the given capacity (item sizes depend on it).
  reset(capacity: number) {
    this.sim.dispose()
    this.sim = this.makeSim(capacity)
    this.frozen = false
    this.dirty = true
  }

  restore(items: SimMarble[]) {
    this.sim.restore(items)
    this.dirty = true
  }

  placeAll(items: SimMarble[]) {
    this.sim.placeAll(items)
    this.dirty = true
  }

  // worldX: where across the mouth to drop it (world units), e.g. under a fly-in token.
  drop(item: SimMarble, worldX?: number) {
    this.frozen = false
    this.sim.drop(item, worldX)
  }

  remove(id: string) {
    this.sim.remove(id)
    this.dirty = true
  }

  shake() {
    if (this.frozen) return
    this.sim.shake()
    this.rattleUntil = performance.now() + RATTLE_MS
  }

  // Jar displacement in CSS px (the canvas is moved by a transform while dragged); its motion jostles the stones.
  setOffset(x: number, y: number) {
    const k = WORLD.width / (this.canvas.clientWidth || WORLD.width)
    this.offset = { x: x * k, y: y * k }
  }

  // Resolves once everything is at rest (or after `timeout` ms).
  settled(timeout = 2500): Promise<void> {
    return new Promise((resolve) => this.waiters.push({ resolve, until: performance.now() + timeout }))
  }

  pulse(color: RGB) {
    this.glowColor = color
    this.glowAt = performance.now()
  }

  // Stones fade and sink out, top first, then the jar is cleared.
  empty(instant = false): Promise<void> {
    const bodies = [...this.sim.bodies.values()].sort((a, b) => a.position.y - b.position.y)
    if (instant || !bodies.length) {
      this.sim.clear()
      this.dirty = true
      return Promise.resolve()
    }
    this.frozen = true
    const now = performance.now()
    const spread = Math.min(700, bodies.length * 18)
    bodies.forEach((b, i) => (b.fade = { start: now + (i / bodies.length) * spread, ms: FADE_MS }))
    return new Promise((resolve) =>
      setTimeout(() => {
        this.sim.clear()
        this.frozen = false
        this.dirty = true
        resolve()
      }, spread + FADE_MS + 40),
    )
  }

  // The jar mouth in viewport coordinates, and a mapper from client x to world x.
  mouth(): { x: number; y: number; visible: boolean; toWorldX: (clientX: number) => number } {
    const rect = this.canvas.getBoundingClientRect()
    const k = rect.width / WORLD.width
    return {
      x: rect.left + ((JAR.left + JAR.right) / 2) * k,
      y: rect.top + (JAR.top - 18) * k,
      visible: rect.width > 0 && rect.bottom > 0 && rect.top < window.innerHeight,
      toWorldX: (clientX) => (clientX - rect.left) / k,
    }
  }

  // Viewport-normalized point for canvas-confetti.
  origin(): { x: number; y: number } {
    const m = this.mouth()
    return { x: m.x / window.innerWidth, y: m.y / window.innerHeight }
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.offScheme()
    this.sim.dispose()
    for (const w of this.waiters) w.resolve()
    this.waiters = []
  }
}

// 0 → 1 → 0 with a quick rise and a long, soft fall.
function envelope(t: number): number {
  if (t < 0 || t > 1) return 0
  return t < 0.18 ? t / 0.18 : Math.pow(1 - (t - 0.18) / 0.82, 1.6)
}
