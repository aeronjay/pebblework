// test/db first: it installs fake-indexeddb before Dexie loads.
import { freshDb } from '../../test/db'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { MarbleDB, newMeta } from '../../db/db'
import { claimAll, ensureActiveQuestJar, getActiveQuestJar, sealedQuestJarCount } from './claim'
import { addDaysToKey, claimableDays, dayStatus } from './day'
import { QuestError, completeQuest, createQuest, deleteQuest, doItToday, uncompleteQuest, updateQuest } from './repo'

const at = (key: string, h = 12) => new Date(`${key}T${String(h).padStart(2, '0')}:00:00`)
const D0 = '2026-11-01'
const day = (n: number) => addDaysToKey(D0, n)
const normal = () => 0.5

async function status(d: MarbleDB, key: string, now: Date) {
  const claimed = !!(await d.dayClaims.get(key))
  return dayStatus(key, await d.quests.toArray(), await d.questCompletions.toArray(), claimed, now)
}

async function dqs(d: MarbleDB, n: number, now = at(D0)) {
  const ids: string[] = []
  for (let i = 0; i < n; i++) ids.push(await createQuest({ category: 'dq', title: `DQ ${i}` }, now, d))
  return ids
}

async function completeAll(d: MarbleDB, ids: string[], now: Date) {
  for (const id of ids) expect(await completeQuest(id, now, d)).toBe(true)
}

describe('quest repo', () => {
  it('recurs DQs daily and enforces the same-day lock', async () => {
    const d = freshDb()
    const [id] = await dqs(d, 1)
    expect(await completeQuest(id, at(D0), d)).toBe(true)
    expect(await completeQuest(id, at(D0, 18), d)).toBe(false) // already done today
    expect(await completeQuest(id, at(day(1)), d)).toBe(true) // new day, new completion
    expect(await d.questCompletions.count()).toBe(2)
    expect(await uncompleteQuest(id, at(day(2)), d)).toBe(false) // yesterday's is locked
    expect(await status(d, D0, at(day(2)))).toBe('ready')
    expect(await status(d, day(2), at(day(2)))).toBe('pending')
  })

  it('un-completes same day, re-completes, and refuses once that completion is claimed', async () => {
    const d = freshDb()
    const [id] = await dqs(d, 1)
    await completeQuest(id, at(D0), d)
    expect(await uncompleteQuest(id, at(D0), d)).toBe(true)
    expect(await status(d, D0, at(D0))).toBe('pending')
    expect(await completeQuest(id, at(D0, 13), d)).toBe(true)
    expect((await d.questCompletions.toArray())[0].deletedAt).toBeUndefined()
    await claimAll(d, at(D0, 14), normal)
    expect(await uncompleteQuest(id, at(D0, 15), d)).toBe(false)
    expect((await d.questCompletions.toArray())[0].claimedAt).toBe(at(D0, 14).toISOString())
  })

  it('deleting a quest keeps its claimed completion but withdraws a newer unclaimed one', async () => {
    const d = freshDb()
    const [a] = await dqs(d, 1)
    const sq = await createQuest({ category: 'sq', title: 'Errand' }, at(D0), d)
    await completeQuest(a, at(D0), d)
    await claimAll(d, at(D0, 13), normal)
    await completeQuest(sq, at(D0, 14), d)
    await deleteQuest(a, at(D0, 15), d)
    await deleteQuest(sq, at(D0, 15), d)
    expect((await d.questCompletions.get(`${a}:${D0}`))?.deletedAt).toBeUndefined()
    expect((await d.questCompletions.get(`${sq}:${D0}`))?.deletedAt).toBeDefined()
    expect(await status(d, D0, at(D0, 16))).toBe('claimed')
  })

  it('rejects past dates and freezes missed or completed dates', async () => {
    const d = freshDb()
    const now = at(day(5))
    await expect(createQuest({ category: 'mq', title: 'x', dueDate: day(4) }, now, d)).rejects.toThrow(QuestError)
    await expect(createQuest({ category: 'dq', title: 'x', startDate: day(4) }, now, d)).rejects.toThrow(QuestError)
    await expect(createQuest({ category: 'sq', title: '  ' }, now, d)).rejects.toThrow(QuestError)

    const mq = await createQuest({ category: 'mq', title: 'Ship', dueDate: day(6) }, now, d)
    await updateQuest(mq, { dueDate: day(8) }, now, d)
    expect((await d.quests.get(mq))?.dueDate).toBe(day(8))
    await expect(updateQuest(mq, { dueDate: day(8) }, at(day(9)), d).then(() => 'ok')).resolves.toBe('ok') // unchanged
    await expect(updateQuest(mq, { dueDate: day(12) }, at(day(9)), d)).rejects.toThrow(/missed/)
    await expect(updateQuest(mq, { dueDate: null }, at(day(9)), d)).rejects.toThrow(/missed/)
    await updateQuest(mq, { title: 'Ship it' }, at(day(9)), d) // non-date edits still fine

    const sq = await createQuest({ category: 'sq', title: 'Errand', dueDate: day(5) }, now, d)
    await completeQuest(sq, now, d)
    await expect(updateQuest(sq, { dueDate: day(6) }, now, d)).rejects.toThrow(/completed/)
  })

  it('copies a missed quest to today exactly once', async () => {
    const d = freshDb()
    const mq = await createQuest({ category: 'mq', title: 'Ship', dueDate: D0, note: 'n' }, at(D0), d)
    await expect(doItToday(mq, at(D0), d)).rejects.toThrow(QuestError) // not missed yet
    const copy = await doItToday(mq, at(day(2)), d)
    expect(await d.quests.get(copy)).toMatchObject({ title: 'Ship', note: 'n', dueDate: day(2), category: 'mq' })
    expect((await d.quests.get(mq))?.redoneAs).toBe(copy)
    await expect(doItToday(mq, at(day(2)), d)).rejects.toThrow(/already/)
    expect(await status(d, D0, at(day(2)))).toBe('closed') // the original day stays closed
    expect(await completeQuest(copy, at(day(2)), d)).toBe(true)
  })

  it('deletes forward only: past days keep the quest, today is freed', async () => {
    const d = freshDb()
    const [a, b] = await dqs(d, 2)
    await completeQuest(a, at(D0), d) // D0 ready (b missing, a alone still claims)
    await completeQuest(a, at(day(1)), d)
    await completeQuest(b, at(day(1)), d) // day 1 ready
    await completeQuest(a, at(day(2)), d)
    await completeQuest(b, at(day(2)), d)
    await deleteQuest(b, at(day(2), 18), d)
    const now = at(day(2), 19)
    expect(await status(d, D0, now)).toBe('ready')
    expect(await status(d, day(1), now)).toBe('ready')
    // b's completion today is withdrawn with it; a alone makes today ready.
    expect((await d.questCompletions.get(`${b}:${day(2)}`))?.deletedAt).toBeDefined()
    expect(await status(d, day(2), now)).toBe('ready')
    expect(await completeQuest(b, now, d)).toBe(false)
    expect(await status(d, day(3), at(day(3)))).toBe('pending')
  })
})

describe('claimAll', () => {
  it('claims every day with completions (partial ones too), skips untouched ones, and is idempotent', async () => {
    const d = freshDb()
    const ids = await dqs(d, 2)
    await completeAll(d, ids, at(D0))
    await completeQuest(ids[0], at(day(1)), d) // partial: one stone
    // day(2): nothing done → closed
    await completeAll(d, ids, at(day(3)))
    const now = at(day(4))
    const first = await claimAll(d, now, normal)
    expect(first.days).toEqual([D0, day(1), day(3)])
    expect(first.stones.map((s) => [s.dayKey, s.weight])).toEqual([[D0, 2], [day(1), 1], [day(3), 2]])
    expect(first.stones.every((s) => s.category === 'dq' && s.rarity === 'normal')).toBe(true)
    expect(await d.dayClaims.count()).toBe(3)
    expect(await claimAll(d, now, normal)).toEqual({ days: [], stones: [], filledJarIds: [] })
    expect(await d.stones.count()).toBe(3)
    expect(await status(d, day(1), now)).toBe('claimed')
    expect(await status(d, day(2), now)).toBe('closed')
  })

  it('claims a single daily quest right away while others are open', async () => {
    const d = freshDb()
    const [a, b] = await dqs(d, 2)
    await completeQuest(a, at(D0, 9), d)
    const r = await claimAll(d, at(D0, 10), normal)
    expect(r.days).toEqual([D0])
    expect(r.stones.map((s) => s.weight)).toEqual([1])
    await completeQuest(b, at(D0, 11), d)
    expect((await claimAll(d, at(D0, 12), normal)).stones.map((s) => s.weight)).toEqual([1])
  })

  it('does not double-award under concurrent calls', async () => {
    const d = freshDb()
    const ids = await dqs(d, 3)
    await completeAll(d, ids, at(D0))
    const [a, b] = await Promise.all([claimAll(d, at(D0, 20), normal), claimAll(d, at(D0, 20), normal)])
    expect([a.days.length, b.days.length].sort()).toEqual([0, 1])
    expect(await d.stones.count()).toBe(1)
    expect(await d.dayClaims.count()).toBe(1)
  })

  it('re-readies a claimed day when more is done later; the next claim drops only the new stones', async () => {
    const d = freshDb()
    const ids = await dqs(d, 2)
    const sq1 = await createQuest({ category: 'sq', title: 'Side 1' }, at(D0), d)
    const sq2 = await createQuest({ category: 'sq', title: 'Side 2' }, at(D0), d)
    await completeAll(d, ids, at(D0, 9))
    const first = await claimAll(d, at(D0, 13), normal)
    expect(first.stones.map((s) => [s.category, s.weight])).toEqual([['dq', 2]])
    expect(await status(d, D0, at(D0, 13))).toBe('claimed')

    // Afternoon: more work lands. Today glows ready again.
    await completeAll(d, [sq1, sq2], at(D0, 15))
    expect(await status(d, D0, at(D0, 15))).toBe('ready')
    // The claimed DQs stay locked; the new SQ can still be undone (and redone).
    expect(await uncompleteQuest(ids[0], at(D0, 15), d)).toBe(false)
    expect(await uncompleteQuest(sq2, at(D0, 15), d)).toBe(true)
    expect(await completeQuest(sq2, at(D0, 16), d)).toBe(true)

    const second = await claimAll(d, at(D0, 17), normal)
    expect(second.days).toEqual([D0])
    expect(second.stones.map((s) => [s.category, s.weight])).toEqual([['sq', 2]])
    expect(await d.stones.count()).toBe(2)
    expect(await d.dayClaims.get(D0)).toMatchObject({ weight: 4, claimedAt: at(D0, 17).toISOString(), jarId: first.stones[0].jarId })
    expect((await d.questCompletions.toArray()).every((c) => c.claimedAt && c.claimJarId)).toBe(true)
    expect(await uncompleteQuest(sq2, at(D0, 18), d)).toBe(false)
    expect(await status(d, D0, at(D0, 18))).toBe('claimed')
    expect(await claimAll(d, at(D0, 18), normal)).toEqual({ days: [], stones: [], filledJarIds: [] })
  })

  it('re-claims an earlier day that gained completions together with newly ready days', async () => {
    const d = freshDb()
    const [a] = await dqs(d, 1)
    await completeQuest(a, at(D0), d)
    await claimAll(d, at(D0, 13), normal)
    const sq = await createQuest({ category: 'sq', title: 'Side' }, at(D0, 14), d)
    await completeQuest(sq, at(D0, 15), d)
    await completeQuest(a, at(day(1)), d)
    const r = await claimAll(d, at(day(1), 20), normal)
    expect(r.days).toEqual([D0, day(1)])
    expect(r.stones.map((s) => [s.dayKey, s.category])).toEqual([[D0, 'sq'], [day(1), 'dq']])
  })

  it('does not double-award a re-claim under concurrent calls', async () => {
    const d = freshDb()
    const ids = await dqs(d, 2)
    await completeAll(d, ids, at(D0, 9))
    await claimAll(d, at(D0, 10), normal)
    const sq = await createQuest({ category: 'sq', title: 'Side' }, at(D0, 11), d)
    await completeQuest(sq, at(D0, 12), d)
    const [x, y] = await Promise.all([claimAll(d, at(D0, 20), normal), claimAll(d, at(D0, 20), normal)])
    expect([x.stones.length, y.stones.length].sort()).toEqual([0, 1])
    expect(await d.stones.count()).toBe(2)
    expect((await d.dayClaims.get(D0))?.weight).toBe(3)
  })

  it('splits heavy days into stones of weight ≤ 3 per category, in drop order', async () => {
    const d = freshDb()
    const ids = await dqs(d, 5)
    const sq = await createQuest({ category: 'sq', title: 'Side' }, at(D0), d)
    await completeAll(d, [...ids, sq], at(D0))
    const { stones } = await claimAll(d, at(D0, 20), normal)
    expect(stones.map((s) => [s.category, s.weight])).toEqual([['dq', 3], ['dq', 2], ['sq', 1]])
    const sorted = [...stones].sort((x, y) => x.at.localeCompare(y.at) || x.id.localeCompare(y.id))
    expect(sorted.map((s) => s.id)).toEqual(stones.map((s) => s.id))
    expect((await d.dayClaims.get(D0))?.weight).toBe(6)
  })

  it('claims a day whose only work is an undated quest', async () => {
    const d = freshDb()
    const sq = await createQuest({ category: 'sq', title: 'Whenever' }, at(D0), d)
    await completeQuest(sq, at(day(3)), d)
    const r = await claimAll(d, at(day(3), 20), normal)
    expect(r.days).toEqual([day(3)])
  })

  it('freezes capacity once the first stone lands', async () => {
    const d = freshDb()
    const ids = await dqs(d, 2) // capacity 2*14 = 28
    const empty = await ensureActiveQuestJar(d, at(D0))
    expect(empty.capacity).toBe(28)
    ids.push(await createQuest({ category: 'dq', title: 'third' }, at(D0), d))
    await completeAll(d, ids, at(D0))
    await claimAll(d, at(D0, 20), normal) // recomputed before first stone: 3*14
    expect((await getActiveQuestJar(d))?.capacity).toBe(42)
    await createQuest({ category: 'dq', title: 'fourth' }, at(day(1)), d)
    const all = (await d.quests.toArray()).map((q) => q.id)
    await completeAll(d, all, at(day(1)))
    await claimAll(d, at(day(1), 20), normal)
    expect((await getActiveQuestJar(d))?.capacity).toBe(42)
  })

  it('seals a full jar, overflows into a new one, and counts jars filled', async () => {
    const d = freshDb()
    // One DQ → capacity clamps to 21. Five DQs a day = stones [3, 2] per day.
    const ids = await dqs(d, 1)
    const jar1 = await ensureActiveQuestJar(d, at(D0))
    expect(jar1.capacity).toBe(21)
    // Lock capacity at 21 by landing a first stone while load is light.
    await completeAll(d, ids, at(D0))
    await claimAll(d, at(D0, 20), normal) // fill 1/21
    const more = []
    for (let i = 0; i < 4; i++) more.push(await createQuest({ category: 'dq', title: `x${i}` }, at(day(1)), d))
    const all = [...ids, ...more]
    for (let n = 1; n <= 5; n++) await completeAll(d, all, at(day(n)))
    // 5 days × weight 5 = 25 more; jar1 hits 21 on day 4's second stone (1 + 3·5 + 3 + 2).
    const r = await claimAll(d, at(day(5), 20), normal)
    expect(r.days).toHaveLength(5)
    expect(r.filledJarIds).toEqual([jar1.id])
    const sealed = await d.jars.get(jar1.id)
    expect(sealed?.sealedAt).toBeDefined()
    const inJar1 = (await d.stones.where('jarId').equals(jar1.id).toArray()).reduce((n, s) => n + s.weight, 0)
    expect(inJar1).toBeGreaterThanOrEqual(21)
    expect(inJar1).toBeLessThanOrEqual(23)
    const jar2 = await getActiveQuestJar(d)
    expect(jar2?.id).not.toBe(jar1.id)
    const inJar2 = (await d.stones.where('jarId').equals(jar2!.id).toArray()).reduce((n, s) => n + s.weight, 0)
    expect(inJar1 + inJar2).toBe(26)
    // Overflow stones are the tail of the drop order.
    const tail = r.stones.slice(r.stones.findIndex((s) => s.jarId === jar2!.id))
    expect(tail.every((s) => s.jarId === jar2!.id)).toBe(true)
    expect(await sealedQuestJarCount(d)).toBe(1)
    // Goal jars are untouched.
    expect((await d.jars.toArray()).every((j) => j.kind === 'quest')).toBe(true)
  })

  it('can fill several jars in one claim', async () => {
    const d = freshDb()
    const [id] = await dqs(d, 1)
    for (let n = 0; n < 50; n++) await completeQuest(id, at(day(n)), d)
    const r = await claimAll(d, at(day(49), 20), normal)
    expect(r.days).toHaveLength(50)
    expect(r.filledJarIds).toHaveLength(2) // 21 + 21, 8 left over
    expect(await sealedQuestJarCount(d)).toBe(2)
    const active = await getActiveQuestJar(d)
    expect(await d.stones.where('jarId').equals(active!.id).count()).toBe(8)
  })

  it('rolls rarity per stone', async () => {
    const d = freshDb()
    const ids = await dqs(d, 1)
    await completeAll(d, ids, at(D0))
    const { stones } = await claimAll(d, at(D0, 20), () => 0.03)
    expect(stones[0].rarity).toBe('golden')
  })
})

describe('v4 migration', () => {
  it('marks completions on days claimed before incremental claims as claimed', async () => {
    const name = `migrate-${Math.random()}`
    // The v3 schema, as shipped.
    const old = new Dexie(name)
    old.version(1).stores({
      goals: 'id, type, status, updatedAt',
      milestones: 'id, goalId, updatedAt',
      checkIns: 'id, goalId, at, updatedAt',
      marbleEvents: 'id, jarId, goalId, sourceId, at, updatedAt',
      jars: 'id, startedAt, sealedAt, updatedAt',
      streaks: 'goalId, updatedAt',
      weeklyReviews: 'id, weekStart, updatedAt',
      unlocks: 'id, key, updatedAt',
      settings: 'id',
    })
    old.version(2).stores({
      jars: 'id, kind, startedAt, sealedAt, updatedAt',
      quests: 'id, category, dueDate, updatedAt',
      questCompletions: 'id, questId, dayKey, updatedAt',
      dayClaims: 'dayKey, jarId, updatedAt',
      stones: 'id, jarId, dayKey, at, updatedAt',
    })
    old.version(3).stores({
      questCompletions: 'id, questId, dayKey, cardId, updatedAt',
      boardColumns: 'id, questId, updatedAt',
      cards: 'id, questId, columnId, updatedAt',
    })
    const meta = newMeta(at(D0).toISOString())
    const claimedAt = at(D0, 20).toISOString()
    await old.table('quests').add({ id: 'q', category: 'dq', title: 'Stretch', order: 0, startDate: D0, ...meta })
    await old.table('questCompletions').bulkAdd([
      { id: `q:${D0}`, questId: 'q', category: 'dq', dayKey: D0, completedAt: meta.createdAt, ...meta },
      { id: `q:${day(1)}`, questId: 'q', category: 'dq', dayKey: day(1), completedAt: meta.createdAt, ...meta },
      { id: `gone:${D0}`, questId: 'gone', category: 'sq', dayKey: D0, completedAt: meta.createdAt, ...meta, deletedAt: meta.createdAt },
    ])
    await old.table('dayClaims').add({ dayKey: D0, jarId: 'j1', claimedAt, weight: 1, ...meta })
    old.close()

    const d = new MarbleDB(name)
    try {
      expect(await d.questCompletions.get(`q:${D0}`)).toMatchObject({ claimedAt, claimJarId: 'j1' })
      expect((await d.questCompletions.get(`q:${day(1)}`))?.claimedAt).toBeUndefined()
      expect((await d.questCompletions.get(`gone:${D0}`))?.claimedAt).toBeUndefined()
      const now = at(day(1), 20)
      expect(await status(d, D0, now)).toBe('claimed')
      expect(claimableDays(await d.quests.toArray(), await d.questCompletions.toArray(), new Set([D0]), now)).toEqual([day(1)])
      expect((await claimAll(d, now, normal)).days).toEqual([day(1)])
      expect(await uncompleteQuest('q', at(D0, 21), d)).toBe(false)
    } finally {
      await d.delete()
    }
  })
})
