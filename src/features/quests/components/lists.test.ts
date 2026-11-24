import { describe, expect, it } from 'vitest'
import type { Quest, QuestCategory } from '../../../db/types'
import type { QuestItem } from '../hooks'
import type { QuestWhen } from '../day'
import { dayCount, isQuestView, reorderWithin, tabCategory, tabDropId, todayItems, withListOrder } from './lists'

function item(id: string, category: QuestCategory, when: QuestWhen, extra: Partial<QuestItem> = {}, quest: Partial<Quest> = {}): QuestItem {
  return {
    quest: { id, category, title: id, order: 0, startDate: '2026-11-01', ...quest } as Quest,
    when,
    done: false,
    doneToday: false,
    canComplete: when === 'today' || when === 'anytime',
    canUncomplete: false,
    missed: when === 'missed',
    ...extra,
  }
}

const items = [
  item('walk', 'dq', 'today', { done: true, doneToday: true }),
  item('read', 'dq', 'today'),
  item('ship', 'mq', 'today'),
  item('later', 'mq', 'upcoming'),
  item('errand', 'sq', 'anytime'),
  item('tidy', 'sq', 'anytime', { done: true, doneToday: true }),
  item('missed', 'sq', 'missed'),
  item('redone', 'sq', 'missed', {}, { redoneAs: 'x' }),
]

describe('today view', () => {
  it('shows what is due today, done today, and missed quests still worth redoing', () => {
    expect(todayItems(items).map((i) => i.quest.id)).toEqual(['walk', 'read', 'ship', 'tidy', 'missed'])
  })

  it('counts on the same basis as the day summary (missed quests do not count)', () => {
    expect(dayCount(items)).toEqual({ done: 2, total: 4 })
    expect(dayCount(items.filter((i) => i.quest.category === 'sq'))).toEqual({ done: 1, total: 1 })
  })
})

describe('view ids', () => {
  it('round-trips tab drop ids and rejects others', () => {
    expect(tabCategory(tabDropId('mq'))).toBe('mq')
    expect(tabCategory(tabDropId('today'))).toBeUndefined()
    expect(tabCategory('mq')).toBeUndefined()
    expect(tabCategory('quest-id')).toBeUndefined()
  })

  it('validates stored views', () => {
    expect(['today', 'all', 'sq', 'nope', null].map(isQuestView)).toEqual([true, true, true, false, false])
  })
})

describe('reordering on the today view', () => {
  const list = [item('a', 'dq', 'today'), item('rest', 'dq', 'upcoming'), item('b', 'dq', 'today'), item('c', 'dq', 'today'), item('m', 'mq', 'today')]
  const ids = (l: QuestItem[]) => l.map((i) => i.quest.id)

  it('moves a quest within its own list, past quests not shown today', () => {
    expect(reorderWithin(list, 'c', 'a')).toEqual({ category: 'dq', ids: ['c', 'a', 'rest', 'b'], before: 'a' })
    expect(reorderWithin(list, 'a', 'b')).toEqual({ category: 'dq', ids: ['rest', 'b', 'a', 'c'], before: 'c' })
    expect(reorderWithin(list, 'a', 'c')).toEqual({ category: 'dq', ids: ['rest', 'b', 'c', 'a'], before: null })
  })

  it('does nothing across lists or onto itself', () => {
    expect(reorderWithin(list, 'a', 'm')).toBeUndefined()
    expect(reorderWithin(list, 'a', 'a')).toBeUndefined()
  })

  it('shows a list in a held order, leaving the others alone', () => {
    expect(ids(withListOrder(list, 'dq', ['c', 'a', 'rest', 'b']))).toEqual(['c', 'a', 'rest', 'b', 'm'])
  })
})
