import { describe, expect, it } from 'vitest'
import type { BoardColumn, Card, PlanSlot, Quest, Task } from '../../db/types'
import type { InProgressItem } from '../board/repo'
import type { QuestItem } from '../quests/hooks'
import { goalIdOf, nextCandidates, pickNext } from './model'

const meta = { createdAt: '', updatedAt: '', deviceId: 'd' }

const quest = (id: string, category: Quest['category'], extra: Partial<Quest> = {}): Quest => ({ id, category, title: id, order: 0, startDate: '2026-11-01', ...meta, ...extra })

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

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, ...meta, ...extra })

const started = (id: string, project: Quest): InProgressItem => ({
  card: { id, questId: project.id, columnId: 'doing', title: id, order: 0, subtasks: [], ...meta } satisfies Card,
  column: { id: 'doing', questId: project.id, title: 'In progress', order: 1, ...meta } satisfies BoardColumn,
  quest: project,
  subtasks: { done: 0, total: 0 },
})

const todayKey = '2026-11-04'
const at = (h: number, m = 0) => new Date(2026, 10, 4, h, m)
const slot = (questId: string, time: string, extra: Partial<PlanSlot> = {}): PlanSlot => ({ questId, time, ...extra })

const project = quest('site', 'mq', { isProject: true, identityId: 'g1' })
const items = [
  item(quest('walk', 'dq', { identityId: 'g2' })),
  item(quest('read', 'dq'), { done: true, doneToday: true }),
  item(quest('report', 'mq', { dueDate: todayKey })),
  item(quest('errand', 'sq', { dueDate: todayKey })),
  item(quest('someday', 'sq'), { when: 'anytime' }),
  item(quest('later', 'mq', { dueDate: '2026-11-06' }), { when: 'upcoming', canComplete: false }),
  item(project, { when: 'anytime', canComplete: false }),
]
const tasks = [task('call'), task('bill', { dueDate: '2026-11-03' }), task('sent', { completedAt: 'x' })]
const inProgress = [started('hero', project)]

const keys = (now: Date, slots: PlanSlot[] = []) => nextCandidates({ now, todayKey, items, slots, tasks, inProgress }).map((c) => c.key)

describe('nextCandidates', () => {
  it('orders by what today asks for, then started work, then the rest', () => {
    expect(keys(at(10))).toEqual(['q:report', 'q:walk', 'q:errand', 'c:hero', 't:bill', 'q:someday', 't:call'])
  })

  it('leaves out what is done, locked or not for today', () => {
    const k = keys(at(10))
    expect(k).not.toContain('q:read')
    expect(k).not.toContain('q:later')
    expect(k).not.toContain('t:sent')
    expect(k).not.toContain('q:site') // a project is worked on through its cards
  })

  it('puts a planned slot first once its time is near, and after today’s quests before that', () => {
    const slots = [slot('errand', '14:00')]
    expect(keys(at(10), slots)).toEqual(['q:report', 'q:walk', 'c:hero', 't:bill', 'q:errand', 'q:someday', 't:call'])
    expect(keys(at(13, 30), slots)[0]).toBe('q:errand')
    expect(keys(at(16), slots)[0]).toBe('q:errand') // still open after its time: still first
  })

  it('offers a planned project and a planned loose end', () => {
    const slots: PlanSlot[] = [slot('site', '09:00', { ifThen: 'do it after lunch' }), { taskId: 'call', time: '09:30' }]
    const out = nextCandidates({ now: at(9), todayKey, items, slots, tasks, inProgress })
    expect(out.slice(0, 2).map((c) => [c.kind, c.key, c.reason])).toEqual([
      ['quest', 'q:site', expect.stringContaining('Planned for')],
      ['task', 't:call', expect.stringContaining('Planned for')],
    ])
    expect(out.filter((c) => c.key === 't:call')).toHaveLength(1) // not listed again as a plain loose end
  })

  it('drops a planned project once some of it was worked on today', () => {
    const worked = items.map((i) => (i.quest.id === 'site' ? { ...i, workedToday: true } : i))
    const out = nextCandidates({ now: at(9), todayKey, items: worked, slots: [slot('site', '09:00')], tasks, inProgress })
    expect(out.map((c) => c.key)).not.toContain('q:site')
  })
})

describe('pickNext', () => {
  it('skips what was waved off, and runs out', () => {
    const all = nextCandidates({ now: at(10), todayKey, items, slots: [], tasks, inProgress })
    expect(pickNext(all, new Set())?.key).toBe('q:report')
    expect(pickNext(all, new Set(['q:report']))?.key).toBe('q:walk')
    expect(pickNext(all, new Set(all.map((c) => c.key)))).toBeUndefined()
  })

  it('finds the goal behind a quest or a card’s project', () => {
    const all = nextCandidates({ now: at(10), todayKey, items, slots: [], tasks, inProgress })
    const by = (key: string) => all.find((c) => c.key === key)!
    expect(goalIdOf(by('q:walk'))).toBe('g2')
    expect(goalIdOf(by('c:hero'))).toBe('g1')
    expect(goalIdOf(by('q:report'))).toBeUndefined()
    expect(goalIdOf(by('t:bill'))).toBeUndefined()
  })
})
