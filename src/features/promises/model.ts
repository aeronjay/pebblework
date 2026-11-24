// The promise history: pure rules. Each day shows what was promised (and how it went) next to everything that was
// actually finished, promised or not. It's a record of your word, kept apart from the jar: no stones, no weights.
import type { Card, DayPlan, Quest, QuestCategory, QuestCompletion, Task } from '../../db/types'
import { promiseLines, type PromiseLine } from '../plan/model'
import { addDaysToKey, isoToDayKey } from '../quests/day'

export type DoneKind = 'quest' | 'card' | 'project' | 'loose'

// One thing finished on a day.
export interface DoneItem {
  key: string
  kind: DoneKind
  title: string
  category?: QuestCategory // quests, cards and projects
  project?: string // a card: the project it belongs to
  promiseKey: string // the promise key it would keep: "q:<quest id>" (cards and projects keep their project's) / "t:<id>"
  promised: boolean // it was on that day's promise
  at: string // ISO, for ordering
}

export interface DayEntry {
  dayKey: string
  promise: PromiseLine[] // empty: no promise that day
  done: DoneItem[]
}

// Newest first. A run of days with no promise and nothing finished collapses into one quiet row.
export type HistoryRow = { kind: 'day'; day: DayEntry } | { kind: 'quiet'; from: string; to: string }

export interface HistoryInput {
  todayKey: string
  plans: DayPlan[]
  completions: QuestCompletion[] // live ones
  quests: Quest[] // including deleted ones, for their titles
  cards: Card[]
  tasks: Task[]
}

// What keeps a promise made for day `key`: a quest with any completion that day (a project: any work on its board),
// a loose end finished on or before it. Same rule as the plan repo's keptKeys.
export function keptOn(key: string, completions: QuestCompletion[], tasks: Task[]): Set<string> {
  return new Set([
    ...completions.filter((c) => c.dayKey === key).map((c) => `q:${c.questId}`),
    ...tasks.flatMap((t) => (t.completedAt && isoToDayKey(t.completedAt) <= key ? [`t:${t.id}`] : [])),
  ])
}

// Everything finished, by day. Subtasks are left out: they're steps inside a card, and the card itself shows up once
// it's done.
export function doneByDay({ completions, quests, cards, tasks }: Omit<HistoryInput, 'todayKey' | 'plans'>): Map<string, Omit<DoneItem, 'promised'>[]> {
  const questById = new Map(quests.map((q) => [q.id, q]))
  const cardById = new Map(cards.map((c) => [c.id, c]))
  const days = new Map<string, Omit<DoneItem, 'promised'>[]>()
  const add = (key: string, item: Omit<DoneItem, 'promised'>) => days.set(key, [...(days.get(key) ?? []), item])
  for (const c of completions) {
    const quest = questById.get(c.questId)
    const kind = c.kind ?? 'quest'
    if (kind === 'quest' && !c.cardId) {
      add(c.dayKey, { key: `q:${c.id}`, kind: 'quest', title: quest?.title ?? 'A deleted quest', category: c.category, promiseKey: `q:${c.questId}`, at: c.completedAt })
    } else if (kind === 'card' && c.cardId) {
      const card = cardById.get(c.cardId)
      add(c.dayKey, {
        key: `c:${c.id}`,
        kind: 'card',
        title: card?.title ?? 'A deleted card',
        category: c.category,
        project: quest?.title,
        promiseKey: `q:${c.questId}`,
        at: c.completedAt,
      })
    } else if (kind === 'project') {
      add(c.dayKey, { key: `p:${c.id}`, kind: 'project', title: quest?.title ?? 'A deleted project', category: c.category, promiseKey: `q:${c.questId}`, at: c.completedAt })
    }
  }
  for (const t of tasks) {
    if (!t.completedAt) continue
    add(isoToDayKey(t.completedAt), { key: `t:${t.id}`, kind: 'loose', title: t.title, promiseKey: `t:${t.id}`, at: t.completedAt })
  }
  return days
}

// Every day from the first one with a promise or anything finished, through today, newest first.
export function buildHistory(input: HistoryInput): HistoryRow[] {
  const { todayKey } = input
  const done = doneByDay(input)
  const plans = new Map(input.plans.filter((p) => !p.deletedAt && p.promise?.length && p.dayKey <= todayKey).map((p) => [p.dayKey, p]))
  const starts = [...plans.keys(), ...[...done.keys()].filter((k) => k <= todayKey)]
  if (!starts.length) return []
  const first = starts.reduce((a, b) => (a < b ? a : b))

  const rows: HistoryRow[] = []
  for (let key = todayKey; key >= first; key = addDaysToKey(key, -1)) {
    const plan = plans.get(key)
    const promise = plan ? promiseLines(plan.promise, keptOn(key, input.completions, input.tasks), key < todayKey) : []
    const promisedKeys = new Set(promise.map((l) => l.key))
    const items = (done.get(key) ?? []).map((d) => ({ ...d, promised: promisedKeys.has(d.promiseKey) })).sort((a, b) => a.at.localeCompare(b.at))
    if (!promise.length && !items.length && key !== todayKey) {
      const last = rows.at(-1)
      if (last?.kind === 'quiet') last.from = key
      else rows.push({ kind: 'quiet', from: key, to: key })
      continue
    }
    rows.push({ kind: 'day', day: { dayKey: key, promise, done: items } })
  }
  return rows
}

export interface HistoryTotals {
  kept: number // promised things kept, on finished days…
  total: number // …out of this many
  wholeDays: number // finished days where every promise was kept
}

// Totals over finished days only: today's promise is still being kept.
export function historyTotals(rows: HistoryRow[], todayKey: string): HistoryTotals {
  const days = rows.flatMap((r) => (r.kind === 'day' && r.day.dayKey < todayKey && r.day.promise.length ? [r.day] : []))
  const lines = days.flatMap((d) => d.promise)
  return {
    kept: lines.filter((l) => l.state === 'kept').length,
    total: lines.length,
    wholeDays: days.filter((d) => d.promise.every((l) => l.state === 'kept')).length,
  }
}

export interface MonthGroup {
  month: string // "yyyy-MM"
  rows: HistoryRow[]
  totals: HistoryTotals
}

// Rows grouped by month, newest first. A quiet run that crosses into another month is split at the boundary, so each
// month only holds its own days.
export function byMonth(rows: HistoryRow[], todayKey: string): MonthGroup[] {
  const groups: MonthGroup[] = []
  const push = (row: HistoryRow, month: string) => {
    const last = groups.at(-1)
    if (last?.month === month) last.rows.push(row)
    else groups.push({ month, rows: [row], totals: { kept: 0, total: 0, wholeDays: 0 } })
  }
  for (const row of rows) {
    if (row.kind === 'day') {
      push(row, row.day.dayKey.slice(0, 7))
      continue
    }
    // Newest part first: from `to` back to the 1st of its month, then the month before, and so on.
    let to = row.to
    while (to >= row.from) {
      const monthStart = `${to.slice(0, 7)}-01`
      const from = row.from > monthStart ? row.from : monthStart
      push({ kind: 'quiet', from, to }, to.slice(0, 7))
      to = addDaysToKey(from, -1)
    }
  }
  for (const g of groups) g.totals = historyTotals(g.rows, todayKey)
  return groups
}
