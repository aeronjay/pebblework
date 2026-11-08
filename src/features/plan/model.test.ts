import { describe, expect, it } from 'vitest'
import type { DayPlan, Quest, Task } from '../../db/types'
import type { QuestItem } from '../quests/hooks'
import { freshStart, laterTime, liveSlots, nextSlot, orderByPlan, planCandidates, planGroup, planKind, slotKey, sortSlots, suggestTime, taskCandidates } from './model'

const quest = (id: string, category: Quest['category'], extra: Partial<Quest> = {}): Quest => ({
  id,
  category,
  title: id,
  order: 0,
  startDate: '2026-11-01',
  createdAt: '',
  updatedAt: '',
  deviceId: 'd',
  ...extra,
})

const item = (q: Quest, extra: Partial<QuestItem> = {}): QuestItem => ({
  quest: q,
  when: 'today',
  done: false,
  doneToday: false,
  canComplete: true,
  canUncomplete: false,
  missed: false,
  ...extra,
})

const plan = (slots: DayPlan['slots'], extra: Partial<DayPlan> = {}): DayPlan => ({ dayKey: '2026-11-04', slots, createdAt: '', updatedAt: '', deviceId: 'd', ...extra })

const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m)

describe('candidates', () => {
  const items = [
    item(quest('walk', 'dq')),
    item(quest('read', 'dq'), { done: true, doneToday: true }),
    item(quest('report', 'mq')),
    item(quest('errand', 'sq', { dueDate: '2026-11-04' })),
    item(quest('someday', 'sq'), { when: 'anytime' }),
    item(quest('later', 'mq', { dueDate: '2026-11-06' }), { when: 'upcoming', canComplete: false }),
    item(quest('rest', 'dq'), { when: 'upcoming', canComplete: false }),
    item(quest('passport', 'mq', { dueDate: '2026-11-01' }), { when: 'missed', missed: true, canComplete: false }),
    item(quest('redone', 'mq', { dueDate: '2026-11-01', redoneAs: 'x' }), { when: 'missed', missed: true, canComplete: false }),
    item(quest('game', 'mq', { isProject: true }), { when: 'anytime', canComplete: false }),
    item(quest('shipped', 'sq', { isProject: true, projectDoneAt: '2026-11-03T10:00:00Z' }), { when: 'anytime', done: true, canComplete: false }),
  ]

  it('anything open that could be worked on today, main quests first; never done, redone or resting ones', () => {
    expect(planCandidates(items).map((i) => i.quest.id)).toEqual(['report', 'passport', 'game', 'later', 'errand', 'someday', 'walk'])
  })

  it('says how each one gets into today', () => {
    const kind = (id: string) => planKind(items.find((i) => i.quest.id === id)!)
    expect([kind('walk'), kind('someday'), kind('later'), kind('passport'), kind('game')]).toEqual(['today', 'today', 'moved', 'redo', 'project'])
    expect([kind('read'), kind('rest'), kind('redone'), kind('shipped')]).toEqual([undefined, undefined, undefined, undefined])
  })

  it('groups the sheet by when each one is due', () => {
    const group = (id: string) => planGroup(items.find((i) => i.quest.id === id)!)
    expect(['report', 'someday', 'passport', 'game', 'later'].map(group)).toEqual(['due', 'anytime', 'redo', 'project', 'moved'])
  })

  it('a planned project counts as handled once any board work is finished today', () => {
    const game = item(quest('game', 'mq', { isProject: true }), { when: 'anytime', canComplete: false })
    const slots = [{ questId: 'game', time: '09:00' }, { questId: 'walk', time: '10:00' }]
    const walk = item(quest('walk', 'dq'))
    expect(nextSlot(slots, [game, walk])?.questId).toBe('game')
    expect(nextSlot(slots, [{ ...game, workedToday: true }, walk])?.questId).toBe('walk')
  })

})

describe('slots on the Today list', () => {
  const items = [item(quest('a', 'dq')), item(quest('b', 'mq'), { done: true }), item(quest('c', 'sq')), item(quest('d', 'dq'))]
  const p = plan([
    { questId: 'c', time: '14:00' },
    { questId: 'b', time: '09:00' },
    { questId: 'gone', time: '08:00' },
  ])

  it('drops slots whose quest is gone, sorted by time', () => {
    expect(liveSlots(p, items).map((s) => s.questId)).toEqual(['b', 'c'])
    expect(liveSlots(undefined, items)).toEqual([])
  })

  it('next up is the first planned quest not done', () => {
    expect(nextSlot(liveSlots(p, items), items)?.questId).toBe('c')
  })

  it('planned quests lead by time; the rest keep their order', () => {
    expect(orderByPlan(items, liveSlots(p, items)).map((i) => i.quest.id)).toEqual(['b', 'c', 'a', 'd'])
  })
})

describe('loose ends in the plan', () => {
  const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, createdAt: '', updatedAt: '', deviceId: 'd', ...extra })
  const walk = item(quest('walk', 'dq'))
  const tasks = [task('bank', { dueDate: '2026-11-06' }), task('late', { dueDate: '2026-11-01' }), task('any'), task('done', { completedAt: 'x' }), task('gone', { deletedAt: 'x' })]

  it('every open one is a candidate, dated first', () => {
    expect(taskCandidates(tasks).map((t) => t.id)).toEqual(['late', 'bank', 'any'])
  })

  it('slots keep loose ends that still exist, interleaved with quests by time', () => {
    const p = plan([{ taskId: 'bank', time: '10:00' }, { questId: 'walk', time: '09:00' }, { taskId: 'gone', time: '08:00' }, { taskId: 'nope', time: '07:00' }])
    expect(liveSlots(p, [walk], tasks).map(slotKey)).toEqual(['q:walk', 't:bank'])
    expect(sortSlots([{ taskId: 'b', time: '09:00' }, { questId: 'a', time: '09:00' }]).map(slotKey)).toEqual(['q:a', 't:b'])
  })

  it('next up skips a ticked loose end', () => {
    const slots = [{ taskId: 'done', time: '08:00' }, { taskId: 'bank', time: '09:00' }, { questId: 'walk', time: '10:00' }]
    expect(slotKey(nextSlot(slots, [walk], tasks)!)).toBe('t:bank')
  })
})

describe('times', () => {
  it('suggests the due time if still ahead, else an hour after the last slot, else the next half hour', () => {
    expect(suggestTime('15:00', undefined, at(8, 10))).toBe('15:00')
    expect(suggestTime('07:00', undefined, at(8, 10))).toBe('08:30')
    expect(suggestTime(undefined, '10:00', at(8, 10))).toBe('11:00')
    expect(suggestTime(undefined, '07:00', at(8, 10))).toBe('08:30')
    expect(suggestTime(undefined, undefined, at(8, 30))).toBe('09:00')
  })

  it('"later" is an hour past the slot or now, whichever is later, on the quarter hour, within the day', () => {
    expect(laterTime('09:00', at(8))).toBe('10:00')
    expect(laterTime('09:00', at(11, 15))).toBe('12:15')
    expect(laterTime('09:00', at(16, 3))).toBe('17:15') // rounded up to the quarter hour
    expect(laterTime('23:30', at(23, 40))).toBe('23:59')
  })
})

describe('fresh start', () => {
  it('back after 3+ quiet days beats a new month, which beats a new week', () => {
    expect(freshStart('2026-11-04', '2026-11-01')).toBe('return')
    expect(freshStart('2026-11-04', '2026-11-02')).toBeUndefined()
    expect(freshStart('2026-12-01', '2026-11-30')).toBe('month')
    expect(freshStart('2026-11-09', '2026-11-08')).toBe('week') // a Monday
    expect(freshStart('2026-11-09', undefined)).toBe('week')
    expect(freshStart('2026-11-04', undefined)).toBeUndefined() // brand new: nothing to come back from
  })
})
