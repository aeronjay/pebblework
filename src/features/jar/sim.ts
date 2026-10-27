import Matter from 'matter-js'
import type { Rarity } from '../../db/types'

const { Bodies, Body, Composite, Engine, Events } = Matter

// Logical world size; the canvas scales this to fit its container.
export const WORLD = { width: 300, height: 380 }
export const JAR = { left: 34, right: 266, top: 46, bottom: 362, wall: 60 }

const PACKING = 0.62 // fraction of the jar interior marbles may fill at capacity

export interface SimMarble {
  id: string
  color: string
  rarity: Rarity
}

export interface MarbleBody extends Matter.Body {
  marble: SimMarble
  dropped: boolean // came in live (not restored), so its first impact clinks
}

export function marbleRadius(capacity: number): number {
  const area = (JAR.right - JAR.left) * (JAR.bottom - JAR.top)
  return Math.sqrt((area * PACKING) / (Math.max(1, capacity) * Math.PI))
}

export class JarSim {
  readonly engine = Engine.create({ enableSleeping: true })
  readonly bodies = new Map<string, MarbleBody>()
  readonly radius: number
  onImpact?: (speed: number) => void

  constructor(capacity: number) {
    this.radius = marbleRadius(capacity)
    const { left, right, bottom, wall } = JAR
    const tall = WORLD.height * 4
    const opts = { isStatic: true, friction: 0.1, restitution: 0.2 }
    Composite.add(this.engine.world, [
      Bodies.rectangle((left + right) / 2, bottom + wall / 2, right - left + wall * 2, wall, opts),
      Bodies.rectangle(left - wall / 2, bottom - tall / 2, wall, tall, opts),
      Bodies.rectangle(right + wall / 2, bottom - tall / 2, wall, tall, opts),
    ])

    Events.on(this.engine, 'collisionStart', (e) => {
      for (const { bodyA, bodyB } of e.pairs) {
        for (const b of [bodyA, bodyB] as MarbleBody[]) {
          if (!b.marble || !b.dropped) continue
          b.dropped = false
          this.onImpact?.(b.speed)
        }
      }
    })
  }

  private create(m: SimMarble, x: number, y: number): MarbleBody {
    const r = this.radius * (0.94 + Math.random() * 0.12)
    const body = Bodies.circle(x, y, r, { restitution: 0.3, friction: 0.04, frictionAir: 0.012, density: 0.002 }) as MarbleBody
    body.marble = m
    body.dropped = false
    this.bodies.set(m.id, body)
    Composite.add(this.engine.world, body)
    return body
  }

  // Restore existing marbles stacked from the bottom, then settle them off-screen.
  restore(marbles: SimMarble[]) {
    const r = this.radius
    const cols = Math.max(1, Math.floor((JAR.right - JAR.left) / (r * 2)))
    marbles.forEach((m, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const jitter = (Math.random() - 0.5) * r * 0.4
      this.create(m, JAR.left + r + col * r * 2 + (row % 2) * r * 0.5 + jitter, JAR.bottom - r - row * r * 1.9)
    })
    this.settle()
  }

  drop(m: SimMarble) {
    const r = this.radius
    const x = JAR.left + r + Math.random() * (JAR.right - JAR.left - r * 2)
    const body = this.create(m, x, JAR.top - r * 3)
    body.dropped = true
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 2 })
  }

  remove(id: string) {
    const body = this.bodies.get(id)
    if (!body) return
    Composite.remove(this.engine.world, body)
    this.bodies.delete(id)
    this.wake()
  }

  // Place a marble directly at rest (reduced motion).
  place(m: SimMarble) {
    const body = this.create(m, (JAR.left + JAR.right) / 2 + (Math.random() - 0.5) * 20, JAR.top)
    body.dropped = false
    this.settle()
  }

  shake() {
    this.wake()
    for (const b of this.bodies.values()) {
      Body.setVelocity(b, { x: (Math.random() - 0.5) * 6, y: -2 - Math.random() * 4 })
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
