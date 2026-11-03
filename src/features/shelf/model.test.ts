import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { newMeta } from '../../db/db'
import type { Jar, Stone } from '../../db/types'
import { buildShelf, layoutPebbles, loadShelf, renameJar, spanLabel } from './model'

const jar = (id: string, extra: Partial<Jar> = {}): Jar => ({ id, kind: 'quest', capacity: 21, startedAt: '2026-10-01T00:00:00.000Z', ...newMeta(), ...extra })
let n = 0
const stone = (jarId: string, dayKey: string, extra: Partial<Stone> = {}): Stone => ({
  id: `s${n++}`,
  jarId,
  dayKey,
  category: 'dq',
  weight: 1,
  rarity: 'normal',
  at: new Date(2026, 9, 1, 0, 0, 0, n).toISOString(),
  ...newMeta(),
  ...extra,
})

describe('buildShelf', () => {
  it('numbers sealed quest jars oldest first and summarizes their stones', () => {
    const jars = [
      jar('b', { sealedAt: '2026-10-20T10:00:00.000Z', label: 'October' }),
      jar('a', { sealedAt: '2026-10-10T10:00:00.000Z' }),
      jar('goal', { kind: undefined, sealedAt: '2026-09-01T00:00:00.000Z' }),
      jar('gone', { sealedAt: '2026-10-11T00:00:00.000Z', deletedAt: 'x' }),
      jar('open'),
    ]
    const stones = [
      stone('a', '2026-10-03', { category: 'mq', weight: 3, rarity: 'golden' }),
      stone('a', '2026-10-01'),
      stone('a', '2026-10-09', { deletedAt: 'x' }),
      stone('b', '2026-10-15', { category: 'sq', weight: 2 }),
    ]
    const shelf = buildShelf(jars, stones)
    expect(shelf.filled.map((j) => [j.jar.id, j.number, j.name])).toEqual([
      ['a', 1, 'Jar 1'],
      ['b', 2, 'October'],
    ])
    expect(shelf.filled[0]).toMatchObject({ weight: 4, rare: 1, firstDay: '2026-10-01', lastDay: '2026-10-03', filledOn: '2026-10-10' })
    expect(shelf.filled[0].byCategory).toEqual({ dq: 1, mq: 3, sq: 0 })
    expect(shelf.current).toBeNull()

    const withCurrent = buildShelf(jars, [...stones, stone('open', '2026-10-21')])
    expect(withCurrent.current).toMatchObject({ number: 3, name: 'Jar 3', weight: 1, filledOn: undefined })
  })

  it('loads from the database and renames', async () => {
    const d = freshDb()
    await d.jars.bulkAdd([jar('a', { sealedAt: '2026-10-10T10:00:00.000Z' }), jar('open')])
    await d.stones.bulkAdd([stone('a', '2026-10-02'), stone('open', '2026-10-12')])
    const shelf = await loadShelf(d)
    expect(shelf.filled).toHaveLength(1)
    expect(shelf.current?.weight).toBe(1)

    await renameJar('a', '  First one  ', new Date(2026, 10, 3), d)
    expect((await d.jars.get('a'))?.label).toBe('First one')
    await renameJar('a', ' ', new Date(2026, 10, 4), d)
    const back = await d.jars.get('a')
    expect(back?.label).toBeUndefined()
    expect(back?.updatedAt).toBe(new Date(2026, 10, 4).toISOString())
  })
})

describe('spanLabel', () => {
  it('formats', () => {
    expect(spanLabel('2026-10-12', '2026-11-03')).toBe('Oct 12 – Nov 3, 2026')
    expect(spanLabel('2026-10-12', '2026-10-12')).toBe('Oct 12, 2026')
    expect(spanLabel('2025-12-30', '2026-01-02')).toBe('Dec 30, 2025 – Jan 2, 2026')
    expect(spanLabel(undefined, undefined)).toBe('')
  })
})

describe('layoutPebbles', () => {
  it('is deterministic, stays inside the jar width and fills from the bottom', () => {
    const stones = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, category: 'dq' as const, rarity: 'normal' as const, weight: 1 as const }))
    const a = layoutPebbles(stones, 21, 100, 120)
    expect(a).toEqual(layoutPebbles(stones, 21, 100, 120))
    expect(a).toHaveLength(21)
    for (const p of a) {
      expect(p.x - p.rx).toBeGreaterThanOrEqual(-0.01)
      expect(p.x + p.rx).toBeLessThanOrEqual(100.01)
      expect(p.y + p.ry).toBeLessThanOrEqual(120.01)
    }
    // A full jar reaches well up the interior but stays inside it.
    const top = Math.min(...a.map((p) => p.y - p.ry))
    expect(top).toBeGreaterThan(-5)
    expect(top).toBeLessThan(50)
  })
})
