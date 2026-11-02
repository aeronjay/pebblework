// Project boards: columns, cards, subtasks, and the stones cards and projects earn.
// Integer `order`, renumbered 0..n-1 (ties: createdAt, then id) on every reorder, so ordering is stable.
// Completions are only ever created/withdrawn by card moves (incl. add/delete/deleteColumn) and complete/reopenProject,
// never by column reorders.
import { db, getDeviceId, newId, newMeta, type MarbleDB } from '../../db/db'
import type { BoardColumn, Card, Quest, QuestCompletion, Subtask } from '../../db/types'
import { cardCompletionId, dayKey, isProject, projectCompletionId } from '../quests/day'
import { QuestError } from '../quests/errors'

export const DEFAULT_COLUMNS = ['To do', 'In progress', 'Done']
export const MIN_COLUMNS = 2
export const PROJECT_BONUS_UNITS = 3

// `null` clears an optional field.
export interface CardPatch {
  title?: string
  note?: string | null
  dueDate?: string | null // dayKey reminder
}

// What a card move did to today's stones (for the "+1 stone ready to claim today" toast).
export interface CardMoveResult {
  awarded: boolean // a new completion was stamped today; it's unclaimed, so it drops a stone on the next claim
  withdrawn: boolean // today's unclaimed card completion was withdrawn
  // Name kept for compatibility: the card's live completion has already been claimed (permanent: it can't be
  // withdrawn and the card can't earn again). Not "today has a claim": cards finished after a claim still earn.
  todayClaimed: boolean
}

export interface BoardState {
  quest: Quest
  columns: BoardColumn[] // live, in order; the last one is the done column
  cardsByColumn: Record<string, Card[]> // every live column id → its live cards in order
  doneColumnId: string
  progress: { done: number; total: number } // cards in the done column / live cards
}

export interface ProjectSummary {
  quest: Quest
  done: number // cards in the done column
  total: number // live cards
  columns: number
  lastActivity?: string // ISO, latest updatedAt among live columns and cards
  nextCard?: Card // first card of the first non-done column
}

type Ordered = { order: number; createdAt: string; id: string }

export function sortByOrder<T extends Ordered>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
}

// The done column is the live column with the highest order.
export function doneColumnOf(columns: BoardColumn[]): BoardColumn | undefined {
  const sorted = sortByOrder(columns.filter((c) => !c.deletedAt))
  return sorted[sorted.length - 1]
}

function stamp(now: Date) {
  return { updatedAt: now.toISOString(), deviceId: getDeviceId() }
}

function cleanTitle(title: string, what: string): string {
  const t = title.trim()
  if (!t) throw new QuestError(`${what} needs a title.`)
  return t
}

function clampIndex(i: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(Number.isFinite(i) ? i : length)))
}

function tables(database: MarbleDB) {
  return [database.quests, database.boardColumns, database.cards, database.questCompletions, database.dayClaims]
}

async function getProject(questId: string, database: MarbleDB): Promise<Quest> {
  const q = await database.quests.get(questId)
  if (!q || q.deletedAt) throw new QuestError('Project not found.')
  if (!isProject(q)) throw new QuestError('This quest is not a project.')
  return q
}

async function liveColumns(questId: string, database: MarbleDB): Promise<BoardColumn[]> {
  return sortByOrder(await database.boardColumns.where('questId').equals(questId).filter((c) => !c.deletedAt).toArray())
}

async function liveCards(columnId: string, database: MarbleDB): Promise<Card[]> {
  return sortByOrder(await database.cards.where('columnId').equals(columnId).filter((c) => !c.deletedAt).toArray())
}

async function getColumn(id: string, database: MarbleDB): Promise<BoardColumn> {
  const c = await database.boardColumns.get(id)
  if (!c || c.deletedAt) throw new QuestError('Column not found.')
  return c
}

async function getCard(id: string, database: MarbleDB): Promise<Card> {
  const c = await database.cards.get(id)
  if (!c || c.deletedAt) throw new QuestError('Card not found.')
  return c
}

// Writes order = index for every item whose order changed (and `columnId` for cards that moved).
async function renumberColumns(list: BoardColumn[], now: Date, database: MarbleDB) {
  for (const [i, c] of list.entries()) if (c.order !== i) await database.boardColumns.update(c.id, { order: i, ...stamp(now) })
}

async function renumberCards(list: Card[], columnId: string, now: Date, database: MarbleDB) {
  for (const [i, c] of list.entries()) {
    if (c.order !== i || c.columnId !== columnId) await database.cards.update(c.id, { order: i, columnId, ...stamp(now) })
  }
}

// The card's (or bonus's) live completion has been claimed.
async function isClaimedLive(id: string, database: MarbleDB): Promise<boolean> {
  const c = await database.questCompletions.get(id)
  return !!c && !c.deletedAt && !!c.claimedAt
}

// Withdraws a live completion only if it was stamped today and isn't claimed yet; otherwise it was honestly earned.
async function withdraw(id: string, now: Date, database: MarbleDB): Promise<boolean> {
  const c = await database.questCompletions.get(id)
  if (!c || c.deletedAt || c.dayKey !== dayKey(now) || c.claimedAt) return false
  await database.questCompletions.update(id, { deletedAt: now.toISOString(), ...stamp(now) })
  return true
}

// Stamps an (unclaimed) completion today unless a live one exists (one per card / project, ever). Returns whether it
// stamped one; a new stamp always earns on the next claim, even if today was claimed earlier.
async function award(
  id: string,
  quest: Quest,
  extra: Pick<QuestCompletion, 'kind' | 'cardId' | 'units'>,
  now: Date,
  database: MarbleDB,
): Promise<boolean> {
  const existing = await database.questCompletions.get(id)
  if (existing && !existing.deletedAt) return false
  const iso = now.toISOString()
  // put: replaces a previously withdrawn (soft-deleted) row with the same id.
  await database.questCompletions.put({
    id,
    questId: quest.id,
    category: quest.category,
    dayKey: dayKey(now),
    completedAt: iso,
    ...extra,
    ...newMeta(iso),
  })
  return true
}

// State-based: a card in the done column holds a completion; a card elsewhere loses today's (if unclaimed).
async function settleCard(card: Card, quest: Quest, inDone: boolean, now: Date, database: MarbleDB): Promise<CardMoveResult> {
  const id = cardCompletionId(card.id)
  if (inDone) {
    await database.cards.update(card.id, { doneAt: now.toISOString(), ...stamp(now) })
    const awarded = await award(id, quest, { kind: 'card', cardId: card.id, units: 1 }, now, database)
    return { awarded, withdrawn: false, todayClaimed: await isClaimedLive(id, database) }
  }
  const withdrawn = await withdraw(id, now, database)
  return { awarded: false, withdrawn, todayClaimed: await isClaimedLive(id, database) }
}

// ---- Columns ----

// Creates the default columns (To do / In progress / Done). Idempotent: returns the existing column ids if any.
export async function createProjectBoard(questId: string, now: Date = new Date(), database: MarbleDB = db): Promise<string[]> {
  return database.transaction('rw', database.quests, database.boardColumns, async () => {
    await getProject(questId, database)
    const existing = await liveColumns(questId, database)
    if (existing.length) return existing.map((c) => c.id)
    const iso = now.toISOString()
    const columns: BoardColumn[] = DEFAULT_COLUMNS.map((title, order) => ({ id: newId(), questId, title, order, ...newMeta(iso) }))
    await database.boardColumns.bulkAdd(columns)
    return columns.map((c) => c.id)
  })
}

// Inserts at `index` (default: just before the done column, so the done column stays done). index ≥ count
// appends, which makes the new column the done column. Returns the id.
export async function addColumn(
  questId: string,
  title: string,
  index?: number,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<string> {
  const clean = cleanTitle(title, 'Column')
  return database.transaction('rw', tables(database), async () => {
    await getProject(questId, database)
    const list = await liveColumns(questId, database)
    const i = clampIndex(index ?? list.length - 1, list.length)
    const column: BoardColumn = { id: newId(), questId, title: clean, order: i, ...newMeta(now.toISOString()) }
    await database.boardColumns.add(column)
    list.splice(i, 0, column)
    await renumberColumns(list, now, database)
    return column.id
  })
}

export async function renameColumn(id: string, title: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  const clean = cleanTitle(title, 'Column')
  await database.transaction('rw', tables(database), async () => {
    const c = await getColumn(id, database)
    await getProject(c.questId, database)
    await database.boardColumns.update(id, { title: clean, ...stamp(now) })
  })
}

// `toIndex` = the column's final index (arrayMove semantics), clamped. Moving a column can change which column is
// done; no completions are created or withdrawn by this — only card moves do that.
export async function moveColumn(id: string, toIndex: number, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', tables(database), async () => {
    const c = await getColumn(id, database)
    await getProject(c.questId, database)
    const list = (await liveColumns(c.questId, database)).filter((x) => x.id !== id)
    list.splice(clampIndex(toIndex, list.length), 0, c)
    await renumberColumns(list, now, database)
  })
}

// Moves the column's cards to the end of `moveCardsTo` (keeping their order), then soft-deletes it. Each moved card
// settles against the done column as it stands after the deletion. Refused below MIN_COLUMNS.
export async function deleteColumn(id: string, moveCardsTo: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', tables(database), async () => {
    const c = await getColumn(id, database)
    const quest = await getProject(c.questId, database)
    const list = await liveColumns(c.questId, database)
    if (list.length <= MIN_COLUMNS) throw new QuestError(`A board needs at least ${MIN_COLUMNS} columns.`)
    if (moveCardsTo === id) throw new QuestError('Pick another column for its cards.')
    const target = await getColumn(moveCardsTo, database)
    if (target.questId !== c.questId) throw new QuestError('Pick a column on the same board.')

    const rest = list.filter((x) => x.id !== id)
    const inDone = doneColumnOf(rest)?.id === target.id
    const moving = await liveCards(id, database)
    await database.boardColumns.update(id, { deletedAt: now.toISOString(), ...stamp(now) })
    await renumberColumns(rest, now, database)
    await renumberCards([...(await liveCards(target.id, database)), ...moving], target.id, now, database)
    for (const card of moving) await settleCard(card, quest, inDone, now, database)
  })
}

// ---- Cards ----

// Appends to the column. Adding straight into the done column counts as finishing it (awards like a move).
export async function addCard(
  questId: string,
  columnId: string,
  title: string,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<string> {
  const clean = cleanTitle(title, 'Card')
  return database.transaction('rw', tables(database), async () => {
    const quest = await getProject(questId, database)
    const column = await getColumn(columnId, database)
    if (column.questId !== questId) throw new QuestError('Column not found.')
    const cards = await liveCards(columnId, database)
    const card: Card = { id: newId(), questId, columnId, title: clean, order: cards.length, subtasks: [], ...newMeta(now.toISOString()) }
    await database.cards.add(card)
    if (doneColumnOf(await liveColumns(questId, database))?.id === columnId) await settleCard(card, quest, true, now, database)
    return card.id
  })
}

export async function updateCard(id: string, patch: CardPatch, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', tables(database), async () => {
    const card = await getCard(id, database)
    await getProject(card.questId, database)
    const changes: Partial<Card> = { ...stamp(now) }
    if (patch.title !== undefined) changes.title = cleanTitle(patch.title, 'Card')
    if (patch.note !== undefined) changes.note = patch.note?.trim() || undefined
    if (patch.dueDate !== undefined) {
      if (patch.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(patch.dueDate)) throw new QuestError('Pick a valid date.')
      changes.dueDate = patch.dueDate || undefined
    }
    await database.cards.update(id, changes)
  })
}

// Soft delete; withdraws the card's completion if it was stamped today and isn't claimed.
export async function deleteCard(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<CardMoveResult> {
  return database.transaction('rw', tables(database), async () => {
    const card = await getCard(id, database)
    await getProject(card.questId, database)
    await database.cards.update(id, { deletedAt: now.toISOString(), ...stamp(now) })
    await renumberCards(await liveCards(card.columnId, database), card.columnId, now, database)
    const withdrawn = await withdraw(cardCompletionId(id), now, database)
    return { awarded: false, withdrawn, todayClaimed: await isClaimedLive(cardCompletionId(id), database) }
  })
}

// `toIndex` = the card's final index in the destination column (arrayMove semantics), clamped. Changing column into
// the done column awards (once per card, ever); out of it withdraws today's completion unless it's been claimed. Reordering within
// a column never touches completions.
export async function moveCard(
  id: string,
  toColumnId: string,
  toIndex: number,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<CardMoveResult> {
  return database.transaction('rw', tables(database), async () => {
    const card = await getCard(id, database)
    const quest = await getProject(card.questId, database)
    const target = await getColumn(toColumnId, database)
    if (target.questId !== card.questId) throw new QuestError('Cards can only move within their board.')
    const list = (await liveCards(toColumnId, database)).filter((c) => c.id !== id)
    list.splice(clampIndex(toIndex, list.length), 0, card)
    await renumberCards(list, toColumnId, now, database)
    if (card.columnId === toColumnId) {
      return { awarded: false, withdrawn: false, todayClaimed: await isClaimedLive(cardCompletionId(id), database) }
    }
    await renumberCards(await liveCards(card.columnId, database), card.columnId, now, database)
    const inDone = doneColumnOf(await liveColumns(card.questId, database))?.id === toColumnId
    return settleCard(card, quest, inDone, now, database)
  })
}

// ---- Subtasks (progress UI only; never earn stones) ----

async function editSubtasks(
  cardId: string,
  now: Date,
  database: MarbleDB,
  edit: (list: Subtask[]) => Subtask[],
): Promise<void> {
  await database.transaction('rw', tables(database), async () => {
    const card = await getCard(cardId, database)
    await getProject(card.questId, database)
    await database.cards.update(cardId, { subtasks: edit([...card.subtasks]), ...stamp(now) })
  })
}

function indexOf(list: Subtask[], subtaskId: string): number {
  const i = list.findIndex((s) => s.id === subtaskId)
  if (i < 0) throw new QuestError('Subtask not found.')
  return i
}

export async function addSubtask(cardId: string, title: string, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const subtask: Subtask = { id: newId(), title: cleanTitle(title, 'Subtask'), done: false }
  await editSubtasks(cardId, now, database, (list) => [...list, subtask])
  return subtask.id
}

// Flips `done`, or sets it when `done` is given.
export async function toggleSubtask(
  cardId: string,
  subtaskId: string,
  done?: boolean,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<void> {
  await editSubtasks(cardId, now, database, (list) => {
    const i = indexOf(list, subtaskId)
    list[i] = { ...list[i], done: done ?? !list[i].done }
    return list
  })
}

export async function renameSubtask(
  cardId: string,
  subtaskId: string,
  title: string,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<void> {
  const clean = cleanTitle(title, 'Subtask')
  await editSubtasks(cardId, now, database, (list) => {
    const i = indexOf(list, subtaskId)
    list[i] = { ...list[i], title: clean }
    return list
  })
}

export async function deleteSubtask(cardId: string, subtaskId: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await editSubtasks(cardId, now, database, (list) => {
    list.splice(indexOf(list, subtaskId), 1)
    return list
  })
}

// `toIndex` = final index (arrayMove semantics), clamped.
export async function moveSubtask(
  cardId: string,
  subtaskId: string,
  toIndex: number,
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<void> {
  await editSubtasks(cardId, now, database, (list) => {
    const [s] = list.splice(indexOf(list, subtaskId), 1)
    list.splice(clampIndex(toIndex, list.length), 0, s)
    return list
  })
}

// ---- Project ----

// Sets projectDoneAt and stamps the 3-unit bonus today (unless a bonus from an earlier completion still stands).
// Returns whether a new bonus was stamped (it drops stones on the next claim, even after an earlier claim today);
// false if a bonus from an earlier completion still stands. Throws if already complete. Open cards are allowed.
export async function completeProject(questId: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', tables(database), async () => {
    const quest = await getProject(questId, database)
    if (quest.projectDoneAt) throw new QuestError('This project is already complete.')
    await database.quests.update(questId, { projectDoneAt: now.toISOString(), ...stamp(now) })
    return award(projectCompletionId(questId), quest, { kind: 'project', units: PROJECT_BONUS_UNITS }, now, database)
  })
}

// Clears projectDoneAt; withdraws the bonus only if it was stamped today and isn't claimed (else it stays, and
// completing again won't re-award). Returns whether the bonus was withdrawn. Throws if not complete.
export async function reopenProject(questId: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', tables(database), async () => {
    const quest = await getProject(questId, database)
    if (!quest.projectDoneAt) throw new QuestError('This project is not complete.')
    await database.quests.update(questId, { projectDoneAt: undefined, ...stamp(now) })
    return withdraw(projectCompletionId(questId), now, database)
  })
}

// ---- Reads (used by hooks.ts; plain async so tests can call them) ----

// null when the quest is missing, deleted, or not a project.
export async function loadBoard(questId: string, database: MarbleDB = db): Promise<BoardState | null> {
  const quest = await database.quests.get(questId)
  if (!quest || quest.deletedAt || !isProject(quest)) return null
  const [columns, cards] = await Promise.all([
    liveColumns(questId, database),
    database.cards.where('questId').equals(questId).filter((c) => !c.deletedAt).toArray(),
  ])
  const cardsByColumn: Record<string, Card[]> = Object.fromEntries(columns.map((c) => [c.id, [] as Card[]]))
  for (const card of sortByOrder(cards)) cardsByColumn[card.columnId]?.push(card)
  const doneColumnId = columns[columns.length - 1]?.id ?? ''
  const total = columns.reduce((n, c) => n + cardsByColumn[c.id].length, 0)
  return { quest, columns, cardsByColumn, doneColumnId, progress: { done: cardsByColumn[doneColumnId]?.length ?? 0, total } }
}

// Every live project quest (complete ones included), sorted like the quest lists.
export async function loadProjects(database: MarbleDB = db): Promise<ProjectSummary[]> {
  const quests = (await database.quests.filter((q) => !q.deletedAt && isProject(q)).toArray()).sort(
    (a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  )
  const boards = await Promise.all(quests.map((q) => loadBoard(q.id, database)))
  return boards.flatMap((b) => {
    if (!b) return []
    const live = [...b.columns, ...Object.values(b.cardsByColumn).flat()]
    const lastActivity = live.reduce<string | undefined>((m, x) => (!m || x.updatedAt > m ? x.updatedAt : m), undefined)
    const nextCard = b.columns.filter((c) => c.id !== b.doneColumnId).flatMap((c) => b.cardsByColumn[c.id])[0]
    return [{ quest: b.quest, ...b.progress, columns: b.columns.length, lastActivity, nextCard }]
  })
}
