import Matter from 'matter-js'
import type { QuestCategory, Rarity } from '../../db/types'

const { Bodies, Body, Composite, Engine, Events } = Matter

// Logical world size; the canvas scales this to fit its container.
export const WORLD = { width: 300, height: 380 }
export const JAR = { left: 34, right: 266, top: 46, bottom: 362, wall: 60 }
export const CORNER = 18 // inner bottom corner radius (drawn), filled by static wedges in the sim

// Fraction of the jar interior the items' own area may cover at capacity (marbles).
export const PACKING = 0.62

// Same for stones. Irregular stones pack loosely, and big ones (small capacity) leave bigger gaps, so a full
// jar of large stones needs less stone area to reach the same height. Tuned (QA pass) so the pile's mean surface
// tracks the number (60% → ~50% surface, peaks higher) while a full jar (+2 overshoot) still stays below the mouth.
export function stonePacking(capacity: number): number {
  const t = Math.min(1, Math.max(0, (capacity - 21) / (150 - 21)))
  return 0.6 + 0.1 * t
}

export interface SimMarble {
  id: string
  color?: string // goal marbles: a concrete color
  category?: QuestCategory // quest stones: colored from the theme at draw time
  rarity: Rarity
  weight?: number // set → a stone (area ∝ weight); unset → a round marble
}

export interface Point {
  x: number
  y: number
}

export interface MarbleBody extends Matter.Body {
  marble: SimMarble
  dropped: boolean // came in live (not restored), so its first impact clinks
  extent: number // max distance from centre to outline
  outline?: Point[] // stones: local outline at angle 0
  fade?: { start: number; ms: number } // being emptied out of the jar
}

const interior = () => (JAR.right - JAR.left) * (JAR.bottom - JAR.top)

// Radius of a round marble when `capacity` marbles fill the jar.
export function marbleRadius(capacity: number): number {
  return Math.sqrt((interior() * PACKING) / (Math.max(1, capacity) * Math.PI))
}

// Equivalent radius (√(area/π)) of a stone. Capacity is in weight units, so area ∝ weight and a jar holding
// Σweight = capacity looks full whatever the mix of sizes.
export function stoneRadius(capacity: number, weight: number): number {
  return Math.sqrt((interior() * stonePacking(capacity) * weight) / (Math.max(1, capacity) * Math.PI))
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

// Small seeded PRNG so a stone keeps its shape and tone across reloads.
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function polygonArea(pts: Point[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a) / 2
}

// A convex, slightly irregular pebble outline with the given area, centred near the origin.
export function stoneOutline(id: string, area: number): Point[] {
  const rng = seeded(hashString(id))
  const n = 7 + Math.floor(rng() * 3)
  const stretch = 1 + rng() * 0.3
  const pts: Point[] = []
  for (let i = 0; i < n; i++) {
    const a = ((i + (rng() - 0.5) * 0.5) / n) * Math.PI * 2
    const r = 0.88 + rng() * 0.24
    pts.push({ x: Math.cos(a) * r * stretch, y: Math.sin(a) * r })
  }
  const hull = Matter.Vertices.hull(pts as unknown as Matter.Vertex[]) as Point[]
  const k = Math.sqrt(area / polygonArea(hull))
  return hull.map((p) => ({ x: p.x * k, y: p.y * k }))
}

export class JarSim {
  readonly engine = Engine.create({ enableSleeping: true })
  readonly bodies = new Map<string, MarbleBody>()
  readonly capacity: number
  readonly radius: number // round marble radius; for stones, the radius of a weight-1 stone
  onImpact?: (speed: number, body: MarbleBody) => void
  onKnock?: (speed: number, body: MarbleBody) => void // any later collision of a settled item (e.g. while shaken)

  constructor(capacity: number) {
    this.capacity = capacity
    this.radius = marbleRadius(capacity)
    const { left, right, bottom, wall } = JAR
    const tall = WORLD.height * 4
    const opts = { isStatic: true, friction: 0.02, frictionStatic: 0.1, restitution: 0.15 } // slick glass: nothing clings to the walls
    const c = CORNER * 0.7
    Composite.add(this.engine.world, [
      Bodies.rectangle((left + right) / 2, bottom + wall / 2, right - left + wall * 2, wall, opts),
      Bodies.rectangle(left - wall / 2, bottom - tall / 2, wall, tall, opts),
      Bodies.rectangle(right + wall / 2, bottom - tall / 2, wall, tall, opts),
      // Wedges in the bottom corners so nothing rests outside the rounded glass.
      Bodies.fromVertices(left + c / 3, bottom - c / 3, [[{ x: 0, y: 0 }, { x: c, y: c }, { x: 0, y: c }]], opts),
      Bodies.fromVertices(right - c / 3, bottom - c / 3, [[{ x: 0, y: 0 }, { x: 0, y: c }, { x: -c, y: c }]], opts),
    ])

    Events.on(this.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        for (const b of [bodyA, bodyB] as MarbleBody[]) {
          if (!b.marble) continue
          if (!b.dropped) {
            if (b.speed > 2.5) this.onKnock?.(b.speed, b)
            continue
          }
          b.dropped = false
          this.onImpact?.(b.speed, b)
        }
      }
    })
  }

  // Equivalent radius of an item (for spacing and spawn heights).
  sizeOf(m: SimMarble): number {
    return m.weight ? stoneRadius(this.capacity, m.weight) : this.radius
  }

  private create(m: SimMarble, x: number, y: number): MarbleBody {
    let body: MarbleBody
    if (m.weight) {
      const r = stoneRadius(this.capacity, m.weight)
      const outline = stoneOutline(m.id, Math.PI * r * r)
      body = Bodies.fromVertices(x, y, [outline as Matter.Vector[]], {
        restitution: 0.12,
        friction: 0.35,
        frictionStatic: 0.6,
        frictionAir: 0.014,
        density: 0.002,
      }) as MarbleBody
      body.outline = body.vertices.map((v) => ({ x: v.x - body.position.x, y: v.y - body.position.y }))
      body.extent = Math.max(...body.outline.map((p) => Math.hypot(p.x, p.y)))
      Body.setAngle(body, Math.random() * Math.PI * 2)
    } else {
      const r = this.radius * (0.94 + Math.random() * 0.12)
      body = Bodies.circle(x, y, r, { restitution: 0.3, friction: 0.04, frictionAir: 0.012, density: 0.002 }) as MarbleBody
      body.extent = r
    }
    body.marble = m
    body.dropped = false
    this.bodies.set(m.id, body)
    Composite.add(this.engine.world, body)
    return body
  }

  // Restore existing items stacked in rows from the bottom (in order), then settle them off-screen.
  restore(marbles: SimMarble[]) {
    let x = JAR.left
    let y = JAR.bottom
    let row = 0
    for (const m of marbles) {
      const d = this.sizeOf(m) * 2.1
      if (x + d > JAR.right) {
        x = JAR.left + (Math.random() * 0.3 * d)
        y -= row * 0.92
        row = 0
      }
      row = Math.max(row, d)
      this.create(m, x + d / 2, y - d / 2 - (Math.random() * d * 0.1))
      x += d
    }
    this.settle()
  }

  drop(m: SimMarble, x?: number) {
    const r = this.sizeOf(m) * 1.25
    const span = JAR.right - JAR.left - r * 2
    const at = x === undefined ? JAR.left + r + Math.random() * span : Math.min(JAR.right - r, Math.max(JAR.left + r, x))
    const body = this.create(m, at, JAR.top - r * (m.weight ? 1.2 : 3))
    body.dropped = true
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 2 })
    if (m.weight) Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.12)
  }

  remove(id: string) {
    const body = this.bodies.get(id)
    if (!body) return
    Composite.remove(this.engine.world, body)
    this.bodies.delete(id)
    this.wake()
  }

  clear() {
    for (const id of [...this.bodies.keys()]) this.remove(id)
  }

  // Place a marble directly at rest (reduced motion).
  place(m: SimMarble) {
    this.placeAll([m])
  }

  placeAll(marbles: SimMarble[]) {
    for (const m of marbles) {
      const r = this.sizeOf(m)
      this.create(m, (JAR.left + JAR.right) / 2 + (Math.random() - 0.5) * (JAR.right - JAR.left - r * 2) * 0.8, JAR.top - r)
      this.settle(60)
    }
    this.settle()
  }

  shake() {
    this.wake()
    for (const b of this.bodies.values()) {
      const k = b.outline ? 0.6 : 1 // stones are heavier: a gentler lift
      Body.setVelocity(b, { x: (Math.random() - 0.5) * 6 * k, y: (-2 - Math.random() * 4) * k })
      if (b.outline) Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.08)
    }
  }

  // The jar itself changed velocity by (-dx, -dy): by inertia every item keeps going, so relative to the glass
  // it gains (dx, dy). Capped so a wild fling can't launch stones out through the mouth.
  jolt(dx: number, dy: number) {
    this.wake()
    const max = 14
    for (const b of this.bodies.values()) {
      const k = b.outline ? 0.85 : 1
      const vx = Math.max(-max, Math.min(max, b.velocity.x + dx * k))
      const vy = Math.max(-max, Math.min(max, b.velocity.y + dy * k))
      Body.setVelocity(b, { x: vx, y: vy })
    }
  }

  step(ms = 1000 / 60) {
    Engine.update(this.engine, ms)
  }

  settle(steps = 240) {
    for (let i = 0; i < steps; i++) this.step()
  }

  get resting(): boolean {
    for (const b of this.bodies.values()) if (!b.isSleeping) return false
    return true
  }

  private wake() {
    for (const b of this.bodies.values()) Matter.Sleeping.set(b, false)
  }

  dispose() {
    Engine.clear(this.engine)
  }
}
