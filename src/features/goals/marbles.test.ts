import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import type { MarbleDB } from '../../db/db'
import { getActiveJar, jarMarbles } from '../marbles/engine'
import { checkIn, chunksCrossed, createGoal, deleteMilestone, liveMilestones, setGoalStatus, setMilestoneDone, undoCheckIn } from './repo'

async function marbleCount(d: MarbleDB) {
  const jar = await getActiveJar(d)
  return jar ? (await jarMarbles(d, jar.id)).length : 0
}

describe('chunksCrossed', () => {
  it('counts chunk boundaries passed', () => {
    expect(chunksCrossed(0, 9, 10)).toBe(0)
    expect(chunksCrossed(9, 10, 10)).toBe(1)
    expect(chunksCrossed(5, 32, 10)).toBe(3)
    expect(chunksCrossed(0, 5, 0)).toBe(0)
  })
})

describe('marble awards from progress', () => {
  it('habit check-ins drop a marble in the goal color; undo removes it', async () => {
    const d = freshDb()
    const id = await createGoal({ type: 'habit', title: 'Read', color: '#f00', schedule: { kind: 'daily' } }, [], d)
    const c = await checkIn(id, {}, d)
    const jar = await getActiveJar(d)
    const [m] = await jarMarbles(d, jar!.id)
    expect(m).toMatchObject({ color: '#f00', goalId: id, reason: 'checkin', sourceId: c })
    await undoCheckIn(c, d)
    expect(await marbleCount(d)).toBe(0)
  })

  it('numeric logs earn a marble per chunk crossed', async () => {
    const d = freshDb()
    const id = await createGoal({ type: 'numeric', title: 'Run', color: '#0f0', target: { amount: 100, unit: 'km', chunk: 10 } }, [], d)
    await checkIn(id, { amount: 7 }, d)
    expect(await marbleCount(d)).toBe(0)
    await checkIn(id, { amount: 25 }, d)
    expect(await marbleCount(d)).toBe(3)
  })

  it('milestones are worth 3 and toggling off or deleting revokes them', async () => {
    const d = freshDb()
    const id = await createGoal({ type: 'project', title: 'P', color: '#00f' }, ['A', 'B'], d)
    const [a, b] = await liveMilestones(id, d)
    await setMilestoneDone(a.id, true, d)
    await setMilestoneDone(a.id, true, d) // no double award
    expect(await marbleCount(d)).toBe(3)
    await setMilestoneDone(a.id, false, d)
    expect(await marbleCount(d)).toBe(0)
    await setMilestoneDone(b.id, true, d)
    await deleteMilestone(b.id, d)
    expect(await marbleCount(d)).toBe(0)
  })

  it('completing a goal awards a bonus once; reactivating takes it back', async () => {
    const d = freshDb()
    const id = await createGoal({ type: 'project', title: 'P', color: '#00f' }, [], d)
    await setGoalStatus(id, 'completed', d)
    await setGoalStatus(id, 'completed', d)
    expect(await marbleCount(d)).toBe(10)
    await setGoalStatus(id, 'active', d)
    expect(await marbleCount(d)).toBe(0)
  })
})
