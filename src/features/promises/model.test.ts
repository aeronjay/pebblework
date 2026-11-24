import { describe, expect, it } from 'vitest'
import type { Card, DayPlan, Quest, QuestCompletion, Task } from '../../db/types'
import { buildHistory, byMonth, historyTotals, type HistoryInput } from './model'

const meta = { createdAt: '', updatedAt: '', deviceId: 'd' }
const quest = (id: string, extra: Partial<Quest> = {}): Quest => ({ id, category: 'mq', title: id.toUpperCase(), order: 0, startDate: '2026-11-01', ...meta, ...extra })
const done = (questId: string, day: string, extra: Partial<QuestCompletion> = {}): QuestCompletion => ({
  id: `${questId}:${day}`,
  questId,
  category: 'mq',
  dayKey: day,
  completedAt: `${day}T10:00:00.000Z`,
  ...meta,
  ...extra,
})
const plan = (day: string, promise: DayPlan['promise']): DayPlan => ({ dayKey: day, slots: [], promise, ...meta })
const task = (id: string, completedAt?: string): Task => ({ id, title: `Task ${id}`, completedAt, ...meta })
const card = (id: string, questId: string): Card => ({ id, questId, columnId: 'c', title: `Card ${id}`, order: 0, subtasks: [], ...meta })

const TODAY = '2026-11-24'
const input = (extra: Partial<HistoryInput>): HistoryInput => ({ todayKey: TODAY, plans: [], completions: [], quests: [], cards: [], tasks: [], ...extra })

describe('promise history', () => {
  it('shows each day’s promise next to everything finished, newest first', () => {
    const rows = buildHistory(
      input({
        quests: [quest('a'), quest('b'), quest('c')],
        plans: [plan('2026-11-23', [{ key: 'q:a', title: 'A' }, { key: 'q:b', title: 'B' }])],
        completions: [done('a', '2026-11-23'), done('c', '2026-11-23')],
      }),
    )
    expect(rows.map((r) => (r.kind === 'day' ? r.day.dayKey : 'quiet'))).toEqual([TODAY, '2026-11-23'])
    const day = rows[1].kind === 'day' ? rows[1].day : undefined
    expect(day?.promise.map((l) => [l.title, l.state])).toEqual([
      ['A', 'kept'],
      ['B', 'broken'],
    ])
    // Everything finished shows, promised or not
    expect(day?.done.map((d) => [d.title, d.promised])).toEqual([
      ['A', true],
      ['C', false],
    ])
  })

  it('today’s unfinished promises are still open', () => {
    const rows = buildHistory(input({ quests: [quest('a')], plans: [plan(TODAY, [{ key: 'q:a', title: 'A' }])] }))
    expect(rows[0].kind === 'day' && rows[0].day.promise[0].state).toBe('open')
  })

  it('days without a promise show what was finished; empty runs collapse into one quiet row', () => {
    const rows = buildHistory(input({ quests: [quest('a')], completions: [done('a', '2026-11-20')] }))
    expect(rows).toEqual([
      expect.objectContaining({ kind: 'day' }),
      { kind: 'quiet', from: '2026-11-21', to: '2026-11-23' },
      expect.objectContaining({ kind: 'day', day: expect.objectContaining({ dayKey: '2026-11-20', promise: [] }) }),
    ])
  })

  it('counts cards, finished projects and loose ends, but not subtasks', () => {
    const rows = buildHistory(
      input({
        quests: [quest('p', { isProject: true, title: 'Thesis' })],
        cards: [card('k', 'p')],
        plans: [plan('2026-11-23', [{ key: 'q:p', title: 'Thesis' }])],
        completions: [
          done('p', '2026-11-23', { id: 'card:k', kind: 'card', cardId: 'k' }),
          done('p', '2026-11-23', { id: 'subtask:k:1', kind: 'subtask', cardId: 'k' }),
          done('p', '2026-11-23', { id: 'project:p', kind: 'project' }),
        ],
        tasks: [task('t', '2026-11-23T12:00:00.000Z')],
      }),
    )
    const day = rows[1].kind === 'day' ? rows[1].day : undefined
    expect(day?.promise[0].state).toBe('kept')
    expect(day?.done.map((d) => [d.kind, d.title, d.project, d.promised])).toEqual([
      ['card', 'Card k', 'Thesis', true],
      ['project', 'Thesis', undefined, true],
      ['loose', 'Task t', undefined, false],
    ])
  })

  it('a deleted quest keeps its title in the record', () => {
    const rows = buildHistory(input({ quests: [quest('a', { deletedAt: '2026-11-24T00:00:00.000Z' })], completions: [done('a', '2026-11-23')] }))
    expect(rows[1].kind === 'day' && rows[1].day.done[0].title).toBe('A')
  })

  it('totals count finished days only', () => {
    const rows = buildHistory(
      input({
        quests: [quest('a'), quest('b')],
        plans: [
          plan('2026-11-22', [{ key: 'q:a', title: 'A' }]),
          plan('2026-11-23', [{ key: 'q:a', title: 'A' }, { key: 'q:b', title: 'B' }]),
          plan(TODAY, [{ key: 'q:b', title: 'B' }]),
        ],
        completions: [done('a', '2026-11-22'), done('a', '2026-11-23')],
      }),
    )
    expect(historyTotals(rows, TODAY)).toEqual({ kept: 2, total: 3, wholeDays: 1 })
  })

  it('nothing promised or finished yet: no history', () => {
    expect(buildHistory(input({}))).toEqual([])
  })
})

describe('byMonth', () => {
  it('groups by month, splits quiet runs at the boundary, and totals each month', () => {
    const rows = buildHistory(
      input({
        quests: [quest('a')],
        plans: [plan('2026-10-28', [{ key: 'q:a', title: 'A' }])],
        completions: [done('a', '2026-10-28'), done('a', '2026-11-22')],
      }),
    )
    const months = byMonth(rows, TODAY)
    expect(months.map((m) => m.month)).toEqual(['2026-11', '2026-10'])
    expect(months[0].rows.at(-1)).toEqual({ kind: 'quiet', from: '2026-11-01', to: '2026-11-21' })
    expect(months[1].rows[0]).toEqual({ kind: 'quiet', from: '2026-10-29', to: '2026-10-31' })
    expect(months[1].totals).toEqual({ kept: 1, total: 1, wholeDays: 1 })
    expect(months[0].totals.total).toBe(0)
  })
})
