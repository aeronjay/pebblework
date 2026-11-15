import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import type { QuestCompletion } from '../../db/types'
import { completeQuest, createQuest, deleteQuest, doItToday } from '../quests/repo'
import {
  activeGoals,
  buildIdentityViews,
  createGoal,
  createIdentity,
  goalLabel,
  goalStanding,
  isQuiet,
  setAchieved,
  deleteIdentity,
  linkQuest,
  listIdentities,
  moveIdentity,
  restoreIdentity,
  updateIdentity,
} from './repo'

const day = (d: number, h = 12) => new Date(2026, 10, d, h)

describe('identity repo', () => {
  it('creates, edits, orders, deletes and restores', async () => {
    const d = freshDb()
    await expect(createIdentity('   ', '', day(1), d)).rejects.toThrow()
    const a = await createIdentity('  someone who   moves daily ', 'energy', day(1), d)
    const b = await createIdentity('a finisher', '', day(1), d)
    expect((await listIdentities(d)).map((i) => [i.statement, i.why ?? null])).toEqual([
      ['someone who moves daily', 'energy'],
      ['a finisher', null],
    ])
    await moveIdentity(b, -1, day(2), d)
    expect((await listIdentities(d)).map((i) => i.id)).toEqual([b, a])

    await updateIdentity(a, { why: ' ' }, day(3), d)
    expect((await d.identities.get(a))?.why).toBeUndefined()
    const before = (await d.identities.get(a))?.updatedAt
    await updateIdentity(a, { statement: 'someone who moves daily' }, day(4), d)
    expect((await d.identities.get(a))?.updatedAt).toBe(before)

    await deleteIdentity(a, day(5), d)
    expect((await listIdentities(d)).map((i) => i.id)).toEqual([b])
    await restoreIdentity(a, day(6), d)
    expect(await listIdentities(d)).toHaveLength(2)
  })

  it('links quests, carries the link through "Do it today", and counts votes', async () => {
    const d = freshDb()
    const id = await createIdentity('a runner', '', day(1), d)
    const run = await createQuest({ category: 'dq', title: 'Run' }, day(1), d)
    const race = await createQuest({ category: 'mq', title: 'Sign up', dueDate: '2026-11-02' }, day(1), d)
    await linkQuest(run, id, day(1), d)
    await linkQuest(race, id, day(1), d)
    await linkQuest(run, 'missing', day(1), d)
    expect((await d.quests.get(run))?.identityId).toBe(id)

    await completeQuest(run, day(1), d)
    await completeQuest(run, day(3), d)
    const copy = await doItToday(race, day(4), d)
    expect((await d.quests.get(copy))?.identityId).toBe(id)

    await deleteQuest(run, day(4), d)
    const views = buildIdentityViews(await listIdentities(d), await d.quests.toArray(), await d.questCompletions.toArray(), day(4))
    expect(views[0].quests.map((q) => q.title)).toEqual(['Sign up', 'Sign up'])
    // Votes from a quest deleted later still count: the work happened.
    expect(views[0]).toMatchObject({ votes: 2, totalVotes: 2, lastVote: '2026-11-03' })

    await linkQuest(copy, null, day(4), d)
    expect((await d.quests.get(copy))?.identityId).toBeUndefined()
  })

  it('ignores old and future completions for the 30-day count', () => {
    const c = (dayKey: string): QuestCompletion => ({ id: dayKey, questId: 'q', category: 'dq', dayKey, completedAt: '', createdAt: '', updatedAt: '', deviceId: 'd' })
    const identity = { id: 'i', statement: 's', order: 0, createdAt: '', updatedAt: '', deviceId: 'd' }
    const quest = { id: 'q', category: 'dq' as const, title: 'Q', order: 0, startDate: '2026-01-01', identityId: 'i', createdAt: '', updatedAt: '', deviceId: 'd' }
    const [v] = buildIdentityViews([identity], [quest], [c('2026-10-05'), c('2026-10-06'), c('2026-11-04'), c('2026-11-09')], day(4))
    expect(v).toMatchObject({ votes: 2, totalVotes: 3, lastVote: '2026-11-04' })
  })
})

describe('goals', () => {
  it('creates an outcome with a target day, edits it, and marks it reached', async () => {
    const d = freshDb()
    await expect(createGoal({ title: ' ' }, day(1), d)).rejects.toThrow('Name the goal first.')
    const g = await createGoal({ title: 'Pass the exam', why: 'to practice', targetDate: '2026-12-01' }, day(1), d)
    const who = await createIdentity('a reader', '', day(1), d)
    expect(await d.identities.get(g)).toMatchObject({ kind: 'outcome', statement: 'Pass the exam', why: 'to practice', targetDate: '2026-12-01' })
    expect(goalLabel((await d.identities.get(g))!)).toBe('Pass the exam')
    expect(goalLabel((await d.identities.get(who))!)).toBe('becoming a reader')

    await updateIdentity(g, { targetDate: null }, day(2), d)
    expect((await d.identities.get(g))?.targetDate).toBeUndefined()
    // An identity has no finish line: a target day or "reached" doesn't apply.
    await updateIdentity(who, { targetDate: '2026-12-01' }, day(2), d)
    await setAchieved(who, true, day(2), d)
    expect(await d.identities.get(who)).not.toHaveProperty('targetDate')
    expect(await d.identities.get(who)).not.toHaveProperty('achievedAt')

    await setAchieved(g, true, day(3), d)
    expect((await d.identities.get(g))?.achievedAt).toBe(day(3).toISOString())
    const views = buildIdentityViews(await listIdentities(d), [], [], day(3))
    expect(activeGoals(views).map((v) => v.identity.id)).toEqual([who])
    await setAchieved(g, false, day(4), d)
    expect(await d.identities.get(g)).not.toHaveProperty('achievedAt')
  })

  it('shows the last week, days left, and which goals have gone quiet', async () => {
    const d = freshDb()
    const g = await createGoal({ title: 'Run a 10K', targetDate: '2026-11-20' }, day(1), d)
    const idle = await createGoal({ title: 'Learn piano' }, day(1), d)
    const bare = await createIdentity('a reader', '', day(1), d)
    const run = await createQuest({ category: 'dq', title: 'Run', identityId: g }, day(1), d)
    await createQuest({ category: 'dq', title: 'Scales', identityId: idle }, day(1), d)
    for (const n of [1, 2, 5]) await completeQuest(run, day(n), d)

    const views = async (n: number) => buildIdentityViews(await listIdentities(d), await d.quests.toArray(), await d.questCompletions.toArray(), day(n))
    const [a, b, c] = await views(6)
    // Nov 6 looks back over Oct 31 – Nov 6.
    expect(a.week).toEqual([false, true, true, false, false, true, false])
    expect(a).toMatchObject({ weekVotes: 3, quietDays: 1, daysLeft: 14 })
    expect(isQuiet(a)).toBe(false)
    expect(goalStanding(a)).toEqual({ text: '14 days left', tone: 'soon' })

    expect(b.quietDays).toBeUndefined()
    expect(isQuiet(b)).toBe(true) // has a quest, never touched
    expect(goalStanding(b).text).toBe('Not started yet')
    expect(isQuiet(c)).toBe(false) // nothing linked: nothing to be behind on
    expect(goalStanding(c).text).toBe('No quests linked yet')

    const [later] = await views(9)
    expect(later.quietDays).toBe(4)
    expect(isQuiet(later)).toBe(true)
    expect(goalStanding(later)).toEqual({ text: '11 days left', tone: 'soon' }) // a close deadline says more than "quiet"
    expect(bare).toBeTruthy()
  })
})
