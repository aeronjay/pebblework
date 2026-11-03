import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { completeQuest, createQuest, placeQuest, reorderProjects, sortQuests } from './repo'

const NOW = new Date(2026, 10, 10, 12)
const TODAY = '2026-11-10'

async function titles(d: ReturnType<typeof freshDb>, category: 'dq' | 'mq' | 'sq') {
  const list = sortQuests(await d.quests.where('category').equals(category).filter((q) => !q.deletedAt).toArray())
  return list.map((q) => q.title)
}

describe('placeQuest', () => {
  it('reorders within a list', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'sq', title: 'a' }, NOW, d)
    await createQuest({ category: 'sq', title: 'b' }, NOW, d)
    await createQuest({ category: 'sq', title: 'c' }, NOW, d)
    await placeQuest(a, 'sq', null, NOW, d)
    expect(await titles(d, 'sq')).toEqual(['b', 'c', 'a'])
  })

  it('moves a side quest into the main list before a given quest, with its unclaimed completion', async () => {
    const d = freshDb()
    await createQuest({ category: 'mq', title: 'm1' }, NOW, d)
    const m2 = await createQuest({ category: 'mq', title: 'm2' }, NOW, d)
    const s = await createQuest({ category: 'sq', title: 's' }, NOW, d)
    await completeQuest(s, NOW, d)
    await placeQuest(s, 'mq', m2, NOW, d)
    expect(await titles(d, 'mq')).toEqual(['m1', 's', 'm2'])
    expect(await titles(d, 'sq')).toEqual([])
    expect((await d.questCompletions.get(`${s}:${TODAY}`))?.category).toBe('mq')
  })

  it('leaves claimed completions alone', async () => {
    const d = freshDb()
    const s = await createQuest({ category: 'sq', title: 's' }, NOW, d)
    await completeQuest(s, NOW, d)
    await d.questCompletions.update(`${s}:${TODAY}`, { claimedAt: NOW.toISOString() })
    await placeQuest(s, 'mq', null, NOW, d)
    expect((await d.questCompletions.get(`${s}:${TODAY}`))?.category).toBe('sq')
  })

  it('keeps hidden quests in place relative to the drop target', async () => {
    const d = freshDb()
    await createQuest({ category: 'mq', title: 'm1' }, NOW, d)
    await createQuest({ category: 'mq', title: 'hidden' }, NOW, d)
    const m2 = await createQuest({ category: 'mq', title: 'm2' }, NOW, d)
    const s = await createQuest({ category: 'sq', title: 's' }, NOW, d)
    await placeQuest(s, 'mq', m2, NOW, d)
    expect(await titles(d, 'mq')).toEqual(['m1', 'hidden', 's', 'm2'])
  })

  it('refuses to move daily quests across lists', async () => {
    const d = freshDb()
    const dq = await createQuest({ category: 'dq', title: 'd' }, NOW, d)
    const s = await createQuest({ category: 'sq', title: 's' }, NOW, d)
    await expect(placeQuest(dq, 'mq', null, NOW, d)).rejects.toThrow(/Daily quests/)
    await expect(placeQuest(s, 'dq', null, NOW, d)).rejects.toThrow(/Daily quests/)
    expect(await titles(d, 'dq')).toEqual(['d'])
  })

  it('refuses to move a missed quest across lists', async () => {
    const d = freshDb()
    const s = await createQuest({ category: 'sq', title: 's', dueDate: '2026-11-08' }, new Date(2026, 10, 7, 12), d)
    await expect(placeQuest(s, 'mq', null, NOW, d)).rejects.toThrow(/missed/)
  })
})

describe('reorderProjects', () => {
  it('stores the grid position', async () => {
    const d = freshDb()
    const a = await createQuest({ category: 'mq', title: 'a', isProject: true }, NOW, d)
    const b = await createQuest({ category: 'sq', title: 'b', isProject: true }, NOW, d)
    await reorderProjects([b, a], NOW, d)
    expect((await d.quests.get(b))?.projectOrder).toBe(0)
    expect((await d.quests.get(a))?.projectOrder).toBe(1)
  })
})
