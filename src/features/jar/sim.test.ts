import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { JAR, JarSim, marbleRadius, seeded, stoneOutline, stoneRadius, type SimMarble } from './sim'

// Deterministic jitter so the pile-height checks can't flake.
beforeEach(() => {
  vi.spyOn(Math, 'random').mockImplementation(seeded(42))
})
afterEach(() => {
  vi.restoreAllMocks()
})

const marbles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), color: '#f00', rarity: 'normal' as const }))

// Stones whose weights sum to `total`, cycling through the given weights.
function stones(total: number, weights: number[] = [1, 2, 3]): SimMarble[] {
  const out: SimMarble[] = []
  let sum = 0
  for (let i = 0; sum < total; i++) {
    const weight = Math.min(weights[i % weights.length], total - sum)
    out.push({ id: `s${i}`, category: 'dq', rarity: 'normal', weight })
    sum += weight
  }
  return out
}

describe('JarSim', () => {
  it.each([50, 100, 200])('fits a full jar of %i marbles inside the glass', (capacity) => {
    const sim = new JarSim(capacity)
    sim.restore(marbles(capacity))
    sim.settle(600)
    const bodies = [...sim.bodies.values()]
    expect(bodies).toHaveLength(capacity)
    for (const b of bodies) {
      expect(b.position.x).toBeGreaterThan(JAR.left)
      expect(b.position.x).toBeLessThan(JAR.right)
      expect(b.position.y).toBeLessThan(JAR.bottom)
      expect(b.position.y).toBeGreaterThan(JAR.top - sim.radius)
    }
    sim.dispose()
  })

  it('drops new marbles in from above and removes them by id', () => {
    const sim = new JarSim(100)
    sim.restore([])
    sim.drop({ id: 'a', color: '#0f0', rarity: 'golden' })
    expect(sim.bodies.get('a')!.position.y).toBeLessThan(JAR.top)
    sim.settle(300)
    expect(sim.bodies.get('a')!.position.y).toBeGreaterThan(JAR.bottom - sim.radius * 2)
    sim.remove('a')
    expect(sim.bodies.size).toBe(0)
  })
})

describe('stone sizing', () => {
  it('scales stone area with weight, from capacity in weight units', () => {
    for (const capacity of [21, 56, 150]) {
      const r1 = stoneRadius(capacity, 1)
      expect(stoneRadius(capacity, 2) ** 2 / r1 ** 2).toBeCloseTo(2, 6)
      expect(stoneRadius(capacity, 3) ** 2 / r1 ** 2).toBeCloseTo(3, 6)
    }
    expect(stoneRadius(150, 1)).toBeLessThan(stoneRadius(21, 1))
    expect(marbleRadius(50)).toBeGreaterThan(marbleRadius(200))
  })

  it('builds polygon bodies whose area follows weight', () => {
    const sim = new JarSim(56)
    sim.restore([
      { id: 'a', category: 'dq', rarity: 'normal', weight: 1 },
      { id: 'b', category: 'mq', rarity: 'golden', weight: 3 },
    ])
    const a = sim.bodies.get('a')!
    const b = sim.bodies.get('b')!
    expect(a.circleRadius).toBeFalsy()
    expect(a.vertices.length).toBeGreaterThan(5)
    expect(a.outline!.length).toBe(a.vertices.length)
    expect(b.area / a.area).toBeCloseTo(3, 1)
    sim.dispose()
  })

  it('gives a stone the same outline every time', () => {
    expect(stoneOutline('abc', 100)).toEqual(stoneOutline('abc', 100))
    expect(stoneOutline('abc', 100)).not.toEqual(stoneOutline('abd', 100))
  })
})

describe('full jar of stones', () => {
  const cases: [number, number[]][] = [
    [21, [1, 2, 3]],
    [21, [3]],
    [56, [1, 2, 3]],
    [56, [3]],
    [150, [1, 2, 3]],
    [150, [1]],
  ]
  it.each(cases)('capacity %i with weights %j (+2 overshoot) stays inside and reads as full', (capacity, weights) => {
    const sim = new JarSim(capacity)
    sim.restore(stones(capacity + 2, weights))
    sim.settle(600)
    let top = Infinity
    for (const b of sim.bodies.values()) {
      expect(b.position.x).toBeGreaterThan(JAR.left)
      expect(b.position.x).toBeLessThan(JAR.right)
      expect(b.position.y).toBeLessThan(JAR.bottom)
      top = Math.min(top, b.bounds.min.y)
    }
    const height = JAR.bottom - JAR.top
    // At capacity the pile reaches high into the jar without spilling over the mouth.
    expect(top).toBeGreaterThan(JAR.top - 12)
    expect((JAR.bottom - top) / height).toBeGreaterThan(0.7)
    sim.dispose()
  })

  it('drops a stone in through the mouth and lets it settle on the floor', () => {
    const sim = new JarSim(40)
    sim.restore([])
    sim.drop({ id: 'x', category: 'sq', rarity: 'normal', weight: 2 }, 150)
    const b = sim.bodies.get('x')!
    expect(b.position.y).toBeLessThan(JAR.top)
    sim.settle(400)
    expect(b.bounds.max.y).toBeGreaterThan(JAR.bottom - 3)
    expect(sim.resting).toBe(true)
    sim.dispose()
  })
})
