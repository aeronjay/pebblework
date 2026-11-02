import { describe, expect, it } from 'vitest'
import { freshDb } from '../test/db'
import { addDaysToKey, claimableDays, dayKey, monthDays } from '../features/quests/day'
import { claimAll } from '../features/quests/claim'
import { loadProjects } from '../features/board/repo'
import { seed } from './seed'

const NOW = new Date(2026, 10, 1, 10, 0)

describe('dev seed', () => {
  it('covers every day status in the last 20 days with a ~60% jar and one sealed jar', async () => {
    const d = freshDb()
    const s = await seed(d, 'demo', NOW)
    expect(s.jarsFilled).toBe(1)
    expect(s.weight / s.capacity).toBeGreaterThan(0.55)
    expect(s.weight / s.capacity).toBeLessThan(0.65)

    const [quests, completions, claims] = await Promise.all([d.quests.toArray(), d.questCompletions.toArray(), d.dayClaims.toArray()])
    const claimed = new Set(claims.map((c) => c.dayKey))
    const days = [...monthDays(new Date(2026, 9, 1), quests, completions, claimed, NOW), ...monthDays(NOW, quests, completions, claimed, NOW)]
    const from = addDaysToKey(dayKey(NOW), -20)
    const window = days.filter((x) => x.key >= from)
    const count = (status: string) => new Set(window.filter((x) => x.status === status).map((x) => x.key)).size
    expect(count('claimed')).toBeGreaterThanOrEqual(5)
    expect(count('ready')).toBe(3)
    expect(count('closed')).toBe(2)
    expect(count('empty')).toBeGreaterThan(0)
    expect(count('future')).toBeGreaterThan(0)
    expect(window.find((x) => x.isToday)?.status).toBe('pending')
    expect(claimableDays(quests, completions, claimed, NOW)).toHaveLength(3)
    const stones = await d.stones.where('jarId').equals(s.jarId).toArray()
    expect(stones.filter((x) => x.rarity === 'golden')).toHaveLength(1)
    expect(new Set(stones.map((x) => x.category)).size).toBeGreaterThan(1)
  })

  it('seeds two projects whose card completions respect the day rules', async () => {
    const d = freshDb()
    await seed(d, 'demo', NOW)
    const projects = await loadProjects(d)
    const starfall = projects.find((p) => p.quest.title === 'Making a Game: Starfall')!
    const portfolio = projects.find((p) => p.quest.title === 'Launch portfolio site')!
    expect(starfall.quest.category).toBe('sq')
    expect(starfall).toMatchObject({ total: 9, done: 3, columns: 4 })
    expect(portfolio.quest.category).toBe('mq')
    expect(portfolio.columns).toBe(3)

    const cards = await d.cards.where('questId').equals(starfall.quest.id).toArray()
    const login = cards.find((c) => c.title === 'Add login/logout')!
    expect(login.subtasks).toHaveLength(4)
    expect(login.subtasks.filter((s) => s.done)).toHaveLength(2)
    expect(cards.some((c) => c.dueDate)).toBe(true)

    const today = dayKey(NOW)
    const comps = (await d.questCompletions.where('questId').equals(starfall.quest.id).toArray()).filter((c) => !c.deletedAt)
    expect(comps.every((c) => c.kind === 'card')).toBe(true)
    expect(comps.map((c) => c.dayKey).sort()).toEqual([addDaysToKey(today, -6), addDaysToKey(today, -2), today])
    expect(await d.dayClaims.get(addDaysToKey(today, -6))).toBeTruthy() // claimed in the seeded history
    expect(await d.dayClaims.get(addDaysToKey(today, -2))).toBeUndefined() // still ready
  })

  it('full mode overflows on the next claim', async () => {
    const d = freshDb()
    const s = await seed(d, 'full', NOW)
    expect(s.weight / s.capacity).toBeGreaterThan(0.88)
    const r = await claimAll(d, NOW)
    expect(r.filledJarIds).toEqual([s.jarId])
  })
})
