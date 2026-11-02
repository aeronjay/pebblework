import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { newMeta } from '../../db/db'
import { awardMarbles, ensureActiveJar, getActiveJar, jarMarbles, revokeMarbles, rollRarity } from './engine'

describe('rollRarity', () => {
  it('maps the roll to rarity tiers', () => {
    expect(rollRarity(() => 0.005)).toBe('mythic')
    expect(rollRarity(() => 0.03)).toBe('golden')
    expect(rollRarity(() => 0.5)).toBe('normal')
  })
})

describe('marble engine', () => {
  it('creates one active jar using the configured capacity', async () => {
    const d = freshDb()
    await d.settings.put({ id: 'settings', jarCapacity: 50, sound: true, haptics: true, weeklyReviewDay: 0, theme: 'system' })
    const a = await ensureActiveJar(d)
    const b = await ensureActiveJar(d)
    expect(a.id).toBe(b.id)
    expect(a.capacity).toBe(50)
  })

  it('ignores quest jars and treats kind-less jars as goal jars', async () => {
    const d = freshDb()
    const meta = newMeta()
    await d.jars.add({ id: 'quest', kind: 'quest', capacity: 30, startedAt: meta.createdAt, ...meta })
    const created = await ensureActiveJar(d)
    expect(created.id).not.toBe('quest')
    expect(created.kind).toBe('goal')

    const legacy = freshDb()
    await legacy.jars.add({ id: 'old', capacity: 100, startedAt: meta.createdAt, ...meta })
    await legacy.jars.add({ id: 'quest', kind: 'quest', capacity: 30, startedAt: meta.createdAt, ...meta })
    expect((await getActiveJar(legacy))?.id).toBe('old')
  })

  it('awards one event per marble and revokes them by source', async () => {
    const d = freshDb()
    const events = await awardMarbles(d, { reason: 'milestone', count: 3, color: '#fff', sourceId: 'm1' }, () => 0.5)
    expect(events).toHaveLength(3)
    expect(events.every((e) => e.rarity === 'normal' && e.count === 1)).toBe(true)

    await awardMarbles(d, { reason: 'checkin', count: 1, color: '#000', sourceId: 'c1' })
    expect(await revokeMarbles(d, 'm1')).toBe(3)
    const left = await jarMarbles(d, events[0].jarId)
    expect(left.map((e) => e.sourceId)).toEqual(['c1'])
  })

  it('does not revoke marbles from sealed jars', async () => {
    const d = freshDb()
    const [e] = await awardMarbles(d, { reason: 'checkin', count: 1, color: '#fff', sourceId: 'c1' })
    await d.jars.update(e.jarId, { sealedAt: new Date().toISOString() })
    expect(await revokeMarbles(d, 'c1')).toBe(0)
  })
})
