import { describe, expect, it } from 'vitest'
import { JAR, JarSim } from './sim'

const marbles = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i), color: '#f00', rarity: 'normal' as const }))

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
