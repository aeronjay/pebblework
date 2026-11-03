// Pin a UTC+8 zone before any Date exists: late-evening UTC times are already "tomorrow" locally.
// (Node re-reads TZ on assignment; `process` is untyped in the app tsconfig.)
;(globalThis as unknown as { process: { env: Record<string, string> } }).process.env.TZ = 'Asia/Manila'

import { describe, expect, it } from 'vitest'
import type { Quest, QuestCategory, QuestCompletion } from '../../db/types'
import {
  addDaysToKey,
  canComplete,
  canUncomplete,
  claimableDays,
  dayKey,
  dayStatus,
  daySummary,
  intensity,
  isAssigned,
  isMissed,
  isQuestDone,
  jarCapacityFor,
  monthDays,
  parseDayKey,
  questWhen,
  stonesForDay,
} from './day'

const meta = { createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', deviceId: 't' }
const at = (key: string, h = 12) => new Date(`${key}T${String(h).padStart(2, '0')}:00:00`)
const TODAY = '2026-11-10'
const NOW = at(TODAY)

function quest(p: Partial<Quest> & { id: string; category: QuestCategory }): Quest {
  return { title: p.id, order: 0, startDate: '2026-11-01', ...meta, ...p }
}
function done(q: Quest, key: string, extra: Partial<QuestCompletion> = {}): QuestCompletion {
  return { id: `${q.id}:${key}`, questId: q.id, category: q.category, dayKey: key, completedAt: at(key).toISOString(), ...meta, ...extra }
}

describe('day keys', () => {
  it('uses the local calendar day, not the UTC day', () => {
    const d = new Date(2026, 10, 1, 0, 30) // 00:30 local = previous day in UTC
    expect(d.toISOString().slice(0, 10)).toBe('2026-10-31')
    expect(dayKey(d)).toBe('2026-11-01')
    expect(dayKey(parseDayKey('2026-11-01'))).toBe('2026-11-01')
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01')
  })

  it('maps a deletion timestamp to its local day', () => {
    // 2026-11-04T17:00Z is 01:00 on the 5th in Manila: deleted on the 5th, so the 4th keeps the quest.
    const q = quest({ id: 'a', category: 'dq', deletedAt: '2026-11-04T17:00:00.000Z' })
    expect(isAssigned(q, '2026-11-04')).toBe(true)
    expect(isAssigned(q, '2026-11-05')).toBe(false)
  })
})

describe('assignment', () => {
  it('assigns a DQ to every day from its start date', () => {
    const q = quest({ id: 'dq', category: 'dq', startDate: '2026-11-05' })
    expect(isAssigned(q, '2026-11-04')).toBe(false)
    expect(isAssigned(q, '2026-11-05')).toBe(true)
    expect(isAssigned(q, '2026-12-25')).toBe(true)
  })

  it('assigns a dated MQ/SQ only to its due day and never assigns undated ones', () => {
    const dated = quest({ id: 'mq', category: 'mq', dueDate: '2026-11-07' })
    expect(isAssigned(dated, '2026-11-07')).toBe(true)
    expect(isAssigned(dated, '2026-11-06')).toBe(false)
    const undated = quest({ id: 'sq', category: 'sq' })
    expect(isAssigned(undated, TODAY)).toBe(false)
  })

  it('drops a deleted quest from its deletion day on but keeps it on earlier days', () => {
    const q = quest({ id: 'dq', category: 'dq', deletedAt: at('2026-11-08').toISOString() })
    expect(isAssigned(q, '2026-11-07')).toBe(true)
    expect(isAssigned(q, '2026-11-08')).toBe(false)
    expect(isAssigned(q, '2026-11-09')).toBe(false)
  })
})

describe('same-day lock', () => {
  const dq = quest({ id: 'dq', category: 'dq' })
  it('lets a DQ be completed once per day, only today', () => {
    expect(canComplete(dq, [], NOW)).toBe(true)
    expect(canComplete(dq, [done(dq, TODAY)], NOW)).toBe(false)
    expect(canComplete(dq, [done(dq, '2026-11-09')], NOW)).toBe(true) // recurs
    expect(canComplete(dq, [done(dq, TODAY, { deletedAt: meta.createdAt })], NOW)).toBe(true)
  })

  it('blocks DQs that have not started and deleted ones', () => {
    expect(canComplete(quest({ id: 'x', category: 'dq', startDate: '2026-11-11' }), [], NOW)).toBe(false)
    expect(canComplete(quest({ id: 'x', category: 'dq', deletedAt: NOW.toISOString() }), [], NOW)).toBe(false)
  })

  it('only allows dated MQ/SQ on the due day', () => {
    expect(canComplete(quest({ id: 'm', category: 'mq', dueDate: TODAY }), [], NOW)).toBe(true)
    expect(canComplete(quest({ id: 'm', category: 'mq', dueDate: '2026-11-09' }), [], NOW)).toBe(false)
    expect(canComplete(quest({ id: 'm', category: 'sq', dueDate: '2026-11-11' }), [], NOW)).toBe(false)
  })

  it('allows an undated quest once, ever', () => {
    const q = quest({ id: 's', category: 'sq' })
    expect(canComplete(q, [], NOW)).toBe(true)
    expect(canComplete(q, [done(q, '2026-11-02')], NOW)).toBe(false)
  })

  it('only un-completes today, and only while that completion is unclaimed', () => {
    expect(canUncomplete(dq, [done(dq, TODAY)], false, NOW)).toBe(true)
    expect(canUncomplete(dq, [done(dq, TODAY, { claimedAt: NOW.toISOString() })], false, NOW)).toBe(false)
    // `todayClaimed` is ignored: a completion made after today's claim can still be undone.
    expect(canUncomplete(dq, [done(dq, TODAY)], true, NOW)).toBe(true)
    expect(canUncomplete(dq, [done(dq, '2026-11-09')], false, NOW)).toBe(false)
  })

  it('treats a past dated quest without completion as missed', () => {
    const q = quest({ id: 'm', category: 'mq', dueDate: '2026-11-09' })
    expect(isMissed(q, [], NOW)).toBe(true)
    expect(isMissed(q, [done(q, '2026-11-09')], NOW)).toBe(false)
    expect(questWhen(q, [], NOW)).toBe('missed')
    expect(questWhen(q, [done(q, '2026-11-09')], NOW)).toBe('past')
    expect(questWhen(quest({ id: 'u', category: 'sq' }), [], NOW)).toBe('anytime')
    expect(questWhen(quest({ id: 'f', category: 'dq', startDate: '2026-11-12' }), [], NOW)).toBe('upcoming')
  })
})

describe('day status', () => {
  const a = quest({ id: 'a', category: 'dq' })
  const b = quest({ id: 'b', category: 'dq' })
  const quests = [a, b]

  it('covers every status', () => {
    expect(dayStatus('2026-11-11', quests, [], false, NOW)).toBe('future')
    expect(dayStatus('2026-10-20', quests, [], false, NOW)).toBe('empty') // before the DQs started
    expect(dayStatus(TODAY, quests, [], false, NOW)).toBe('pending')
    // One finished quest is claimable on its own; the rest of the day doesn't have to be done.
    expect(dayStatus(TODAY, quests, [done(a, TODAY)], false, NOW)).toBe('ready')
    expect(dayStatus(TODAY, quests, [done(a, TODAY), done(b, TODAY)], false, NOW)).toBe('ready')
    expect(dayStatus('2026-11-09', quests, [done(a, '2026-11-09')], false, NOW)).toBe('ready')
    expect(dayStatus('2026-11-08', quests, [], false, NOW)).toBe('closed')
    expect(dayStatus('2026-11-08', quests, [], true, NOW)).toBe('claimed')
  })

  it('ignores un-completed (soft-deleted) completions', () => {
    const comps = [done(a, TODAY, { deletedAt: meta.createdAt })]
    expect(dayStatus(TODAY, quests, comps, false, NOW)).toBe('pending')
  })

  it('needs at least one completion to be ready', () => {
    expect(dayStatus(TODAY, [], [], false, NOW)).toBe('empty')
    const undated = quest({ id: 'u', category: 'sq' })
    expect(dayStatus(TODAY, [undated], [done(undated, TODAY)], false, NOW)).toBe('ready')
  })

  it('keeps a past day closed when its quest is deleted later, but frees today when deleted today', () => {
    const deleted = { ...b, deletedAt: NOW.toISOString() }
    expect(dayStatus('2026-11-09', [a, deleted], [], false, NOW)).toBe('closed')
    expect(dayStatus(TODAY, [deleted], [], false, NOW)).toBe('empty')
  })

  it('counts completions of a deleted quest toward the day', () => {
    const deleted = { ...a, deletedAt: NOW.toISOString() }
    const s = daySummary('2026-11-09', [deleted], [done(deleted, '2026-11-09')], false, NOW)
    expect(s).toMatchObject({ status: 'ready', assigned: 1, done: 1, intensity: 1, categories: ['dq'] })
  })

  it('lists only ready days with unclaimed completions up to today, oldest first', () => {
    const claimedAt = { claimedAt: at('2026-11-07', 20).toISOString() }
    const comps = [
      done(a, '2026-11-08'), done(b, '2026-11-08'),
      done(a, '2026-11-07', claimedAt), done(b, '2026-11-07', claimedAt),
      done(a, '2026-11-06'), // partial day: still claimable
      done(a, TODAY),
    ]
    expect(claimableDays(quests, comps, new Set(['2026-11-07']), NOW)).toEqual(['2026-11-06', '2026-11-08', TODAY])
  })

  it('makes a claimed day ready again when new completions land', () => {
    const claimedAt = { claimedAt: at(TODAY, 13).toISOString() }
    const u = quest({ id: 'u', category: 'sq' })
    const claimedOnly = [done(a, TODAY, claimedAt), done(b, TODAY, claimedAt)]
    expect(dayStatus(TODAY, [a, b, u], claimedOnly, true, NOW)).toBe('claimed')
    expect(claimableDays([a, b, u], claimedOnly, new Set([TODAY]), NOW)).toEqual([])
    const more = [...claimedOnly, done(u, TODAY)]
    expect(dayStatus(TODAY, [a, b, u], more, true, NOW)).toBe('ready')
    expect(claimableDays([a, b, u], more, new Set([TODAY]), NOW)).toEqual([TODAY])
    // Claimed completions alone mark the day claimed, even without the DayClaim flag.
    expect(dayStatus(TODAY, [a, b], claimedOnly, false, NOW)).toBe('claimed')
    // A quest added after the claim doesn't block new completions: nothing new → claimed, something new → ready.
    const c = quest({ id: 'c', category: 'dq', startDate: TODAY })
    expect(dayStatus(TODAY, [a, b, c, u], claimedOnly, true, NOW)).toBe('claimed')
    expect(dayStatus(TODAY, [a, b, c, u], more, true, NOW)).toBe('ready')
    // A past claimed day stays claimed (never closed) even with an unfinished later addition.
    const past = '2026-11-09'
    const pastDone = [done(a, past, claimedAt), done(b, past, claimedAt), done(u, past)]
    const late = quest({ id: 'l', category: 'dq', startDate: past })
    expect(dayStatus(past, [a, b, late, u], pastDone.slice(0, 2), true, NOW)).toBe('claimed')
    expect(dayStatus(past, [a, b, late, u], pastDone, true, NOW)).toBe('ready')
  })
})

describe('intensity and stones', () => {
  it('buckets like GitHub', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 20].map(intensity)).toEqual([0, 1, 2, 2, 3, 3, 4, 4])
  })

  it('splits each category into stones of weight ≤ 3', () => {
    const q = (c: QuestCategory, i: number) => quest({ id: `${c}${i}`, category: c })
    const comps = [
      ...[0, 1, 2, 3, 4].map((i) => done(q('sq', i), TODAY)),
      done(q('dq', 0), TODAY),
      ...[0, 1, 2, 3].map((i) => done(q('mq', i), TODAY)),
    ]
    expect(stonesForDay(comps)).toEqual([
      { category: 'dq', weight: 1 },
      { category: 'mq', weight: 3 },
      { category: 'mq', weight: 1 },
      { category: 'sq', weight: 3 },
      { category: 'sq', weight: 2 },
    ])
    expect(stonesForDay([])).toEqual([])
  })
})

describe('jar capacity', () => {
  it('scales with quest load and clamps to [21, 150]', () => {
    expect(jarCapacityFor([], NOW)).toBe(21)
    const dqs = [0, 1, 2].map((i) => quest({ id: `d${i}`, category: 'dq' }))
    const soon = quest({ id: 'm', category: 'mq', dueDate: addDaysToKey(TODAY, 13) })
    const later = quest({ id: 'm2', category: 'mq', dueDate: addDaysToKey(TODAY, 14) })
    const past = quest({ id: 'm3', category: 'mq', dueDate: '2026-11-01' })
    const open = quest({ id: 's', category: 'sq' })
    const closedOut = quest({ id: 's2', category: 'sq' })
    const gone = quest({ id: 'g', category: 'dq', deletedAt: NOW.toISOString() })
    const all = [...dqs, soon, later, past, open, closedOut, gone]
    expect(jarCapacityFor(all, NOW, [done(closedOut, '2026-11-02')])).toBe(3 * 14 + 1 + 1)
    const many = Array.from({ length: 12 }, (_, i) => quest({ id: `x${i}`, category: 'dq' }))
    expect(jarCapacityFor(many, NOW)).toBe(150)
  })
})

describe('month grid', () => {
  it('pads to full weeks and flags today', () => {
    const days = monthDays(new Date(2026, 10, 1), [], [], new Set(), NOW)
    expect(days.length % 7).toBe(0)
    expect(days[0].key).toBe('2026-11-01') // Nov 1 2026 is a Sunday
    expect(days.filter((d) => d.inMonth)).toHaveLength(30)
    expect(days.find((d) => d.isToday)?.key).toBe(TODAY)
    expect(days.find((d) => d.key === '2026-11-20')?.status).toBe('future')
  })
})

describe('project quests and units', () => {
  const card = (q: Quest, cardId: string, key: string, extra: Partial<QuestCompletion> = {}): QuestCompletion =>
    done(q, key, { id: `card:${cardId}`, kind: 'card', cardId, units: 1, ...extra })
  const bonus = (q: Quest, key: string) => done(q, key, { id: `project:${q.id}`, kind: 'project', units: 3 })

  it('never assigns a project, even with a deadline, and never marks it missed or completable', () => {
    const p = quest({ id: 'p', category: 'sq', isProject: true, dueDate: '2026-11-05' })
    expect(isAssigned(p, '2026-11-05')).toBe(false)
    expect(isMissed(p, [], NOW)).toBe(false)
    expect(canComplete(p, [], NOW)).toBe(false)
    expect(questWhen(p, [], NOW)).toBe('anytime')
    expect(dayStatus('2026-11-05', [p], [], false, NOW)).toBe('empty') // the deadline never blocks a day
  })

  it('marks a project done only via projectDoneAt; card and bonus completions never mark the quest done', () => {
    const p = quest({ id: 'p', category: 'mq', isProject: true })
    const comps = [card(p, 'c1', TODAY), bonus(p, TODAY)]
    expect(isQuestDone(p, comps, NOW)).toBe(false)
    const finished = { ...p, projectDoneAt: at('2026-11-09').toISOString() }
    expect(isQuestDone(finished, comps, NOW)).toBe(true)
    expect(questWhen(finished, comps, NOW)).toBe('past')
    // A plain undated quest with a stray card-kind row isn't done either.
    const u = quest({ id: 'u', category: 'sq' })
    expect(isQuestDone(u, [card(u, 'x', TODAY)], NOW)).toBe(false)
    expect(canComplete(u, [card(u, 'x', TODAY)], NOW)).toBe(true)
  })

  it('sums units for stones and intensity, keeping done ≤ assigned', () => {
    const p = quest({ id: 'p', category: 'sq', isProject: true })
    const d = quest({ id: 'd', category: 'dq' })
    const comps = [card(p, 'c1', TODAY), card(p, 'c2', TODAY), bonus(p, TODAY), card(p, 'c3', TODAY, { deletedAt: meta.createdAt })]
    expect(stonesForDay(comps)).toEqual([{ category: 'sq', weight: 3 }, { category: 'sq', weight: 2 }])
    expect(intensity(5)).toBe(3)
    // Only card work today, DQ still open → still ready (cards claim on their own); summary counts units.
    expect(daySummary(TODAY, [p, d], comps, false, NOW)).toMatchObject({ status: 'ready', done: 5, assigned: 6, intensity: 3, categories: ['dq', 'sq'] })
    // Nothing else pending → ready (claimable).
    expect(dayStatus(TODAY, [p], comps, false, NOW)).toBe('ready')
    expect(claimableDays([p], comps, new Set(), NOW)).toEqual([TODAY])
    expect(daySummary(TODAY, [p], comps, false, NOW)).toMatchObject({ done: 5, assigned: 5 })
  })

  it('counts an open project once toward jar capacity and a finished one not at all', () => {
    const open = quest({ id: 'p', category: 'sq', isProject: true, dueDate: addDaysToKey(TODAY, 3) })
    const finished = quest({ id: 'f', category: 'mq', isProject: true, projectDoneAt: NOW.toISOString() })
    const dqs = [0, 1].map((i) => quest({ id: `d${i}`, category: 'dq' }))
    expect(jarCapacityFor([...dqs, open, finished], NOW, [card(open, 'c', TODAY)])).toBe(2 * 14 + 1)
  })
})
