import { describe, expect, it } from 'vitest'
import type { MarbleDB } from '../../db/db'
import { freshDb } from '../../test/db'
import { claimAll } from '../quests/claim'
import { addDaysToKey, dayStatus, isQuestDone } from '../quests/day'
import { QuestError, completeQuest, createQuest, deleteQuest, updateQuest } from '../quests/repo'
import {
  addCard,
  addColumn,
  addSubtask,
  completeProject,
  createProjectBoard,
  deleteCard,
  deleteColumn,
  deleteSubtask,
  loadBoard,
  loadProjects,
  moveCard,
  moveColumn,
  moveSubtask,
  renameColumn,
  renameSubtask,
  reopenProject,
  toggleSubtask,
  updateCard,
} from './repo'

const at = (key: string, h = 12) => new Date(`${key}T${String(h).padStart(2, '0')}:00:00`)
const D0 = '2026-11-01'
const day = (n: number) => addDaysToKey(D0, n)
const NOW = at(D0)
const normal = () => 0.5

async function project(d: MarbleDB, category: 'mq' | 'sq' = 'sq', now = NOW) {
  const id = await createQuest({ category, title: 'Making a Game: Starfall', isProject: true }, now, d)
  const board = (await loadBoard(id, d))!
  const [todo, doing, done] = board.columns.map((c) => c.id)
  return { id, todo, doing, done }
}

async function board(d: MarbleDB, id: string) {
  return (await loadBoard(id, d))!
}

async function titles(d: MarbleDB, id: string, columnId: string) {
  return (await board(d, id)).cardsByColumn[columnId].map((c) => c.title)
}

async function liveCompletions(d: MarbleDB) {
  return (await d.questCompletions.toArray()).filter((c) => !c.deletedAt)
}

async function status(d: MarbleDB, key: string, now: Date) {
  const claimed = !!(await d.dayClaims.get(key))
  return dayStatus(key, await d.quests.toArray(), await d.questCompletions.toArray(), claimed, now)
}

describe('project quests', () => {
  it('creates the default board with the quest, done = last column', async () => {
    const d = freshDb()
    const p = await project(d)
    const b = await board(d, p.id)
    expect(b.quest.isProject).toBe(true)
    expect(b.columns.map((c) => [c.title, c.order])).toEqual([['To do', 0], ['In progress', 1], ['Done', 2]])
    expect(b.doneColumnId).toBe(p.done)
    expect(b.progress).toEqual({ done: 0, total: 0 })
    expect(await createProjectBoard(p.id, NOW, d)).toEqual([p.todo, p.doing, p.done]) // idempotent
  })

  it('only allows MQ/SQ projects', async () => {
    const d = freshDb()
    await expect(createQuest({ category: 'dq', title: 'Habit', isProject: true }, NOW, d)).rejects.toThrow(QuestError)
    expect(await d.quests.count()).toBe(0)
    expect(await d.boardColumns.count()).toBe(0)
    const plain = await createQuest({ category: 'sq', title: 'Plain' }, NOW, d)
    expect(await loadBoard(plain, d)).toBeNull()
    await expect(createProjectBoard(plain, NOW, d)).rejects.toThrow(QuestError)
    await expect(addColumn(plain, 'X', undefined, NOW, d)).rejects.toThrow(/not a project/)
  })

  it('is never assigned or completable as a quest; its deadline stays editable', async () => {
    const d = freshDb()
    const id = await createQuest({ category: 'mq', title: 'Launch', isProject: true, dueDate: D0 }, NOW, d)
    expect(await completeQuest(id, NOW, d)).toBe(false)
    expect(await status(d, D0, NOW)).toBe('empty') // due today, yet doesn't block today
    const b = await board(d, id)
    await addCard(id, b.doneColumnId, 'Domain', NOW, d)
    await updateQuest(id, { dueDate: day(3) }, NOW, d) // card completions don't freeze the deadline
    await expect(updateQuest(id, { dueDate: day(1) }, at(day(2)), d)).rejects.toThrow(/past/)
    expect((await d.quests.get(id))?.dueDate).toBe(day(3))
    await updateQuest(id, { dueDate: day(6) }, at(day(5)), d) // a passed deadline isn't "missed" or frozen
    expect((await d.quests.get(id))?.dueDate).toBe(day(6))
  })
})

describe('columns', () => {
  it('adds before the done column by default, or at an index', async () => {
    const d = freshDb()
    const p = await project(d)
    const playtest = await addColumn(p.id, ' Playtest ', undefined, NOW, d)
    let b = await board(d, p.id)
    expect(b.columns.map((c) => c.title)).toEqual(['To do', 'In progress', 'Playtest', 'Done'])
    expect(b.columns.map((c) => c.order)).toEqual([0, 1, 2, 3])
    expect(b.doneColumnId).toBe(p.done)
    await addColumn(p.id, 'Backlog', 0, NOW, d)
    const shipped = await addColumn(p.id, 'Shipped', 99, NOW, d) // appended → becomes the done column
    b = await board(d, p.id)
    expect(b.columns.map((c) => c.title)).toEqual(['Backlog', 'To do', 'In progress', 'Playtest', 'Done', 'Shipped'])
    expect(b.doneColumnId).toBe(shipped)
    await renameColumn(playtest, 'QA', NOW, d)
    expect((await d.boardColumns.get(playtest))?.title).toBe('QA')
    await expect(renameColumn(playtest, '  ', NOW, d)).rejects.toThrow(QuestError)
    await expect(addColumn(p.id, '', undefined, NOW, d)).rejects.toThrow(QuestError)
  })

  it('reorders columns stably with arrayMove semantics and clamping', async () => {
    const d = freshDb()
    const p = await project(d)
    await moveColumn(p.done, 0, NOW, d)
    let b = await board(d, p.id)
    expect(b.columns.map((c) => c.title)).toEqual(['Done', 'To do', 'In progress'])
    expect(b.columns.map((c) => c.order)).toEqual([0, 1, 2])
    await moveColumn(p.done, 1, NOW, d)
    b = await board(d, p.id)
    expect(b.columns.map((c) => c.title)).toEqual(['To do', 'Done', 'In progress'])
    await moveColumn(p.done, 50, NOW, d)
    await moveColumn(p.todo, -3, NOW, d)
    b = await board(d, p.id)
    expect(b.columns.map((c) => c.title)).toEqual(['To do', 'In progress', 'Done'])
    expect(b.columns.map((c) => c.order)).toEqual([0, 1, 2])
  })

  it('column reorders never create or withdraw completions; card state settles on the next card move', async () => {
    const d = freshDb()
    const p = await project(d)
    const a = await addCard(p.id, p.done, 'A', NOW, d) // in done → awarded
    const b = await addCard(p.id, p.doing, 'B', NOW, d)
    expect((await liveCompletions(d)).map((c) => c.id)).toEqual([`card:${a}`])

    await moveColumn(p.doing, 2, NOW, d) // "In progress" is now the done column
    const s = await board(d, p.id)
    expect(s.doneColumnId).toBe(p.doing)
    expect(s.progress).toEqual({ done: 1, total: 2 }) // progress follows columns; B counts as done now
    expect((await liveCompletions(d)).map((c) => c.id)).toEqual([`card:${a}`]) // nothing awarded for B, A kept

    // Moving B within its (now done) column is a reorder: still no award.
    await moveCard(b, p.doing, 0, NOW, d)
    expect(await liveCompletions(d)).toHaveLength(1)
    // A moves from the old done column to the new one: it already holds its completion → no second award.
    expect(await moveCard(a, p.doing, 1, NOW, d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: false })
    // A moves to a non-done column: today's completion is withdrawn (state-based).
    expect(await moveCard(a, p.todo, 0, NOW, d)).toEqual({ awarded: false, withdrawn: true, todayClaimed: false })
    // B leaves and re-enters the done column → now it earns.
    await moveCard(b, p.todo, 0, NOW, d)
    expect(await moveCard(b, p.doing, 0, NOW, d)).toEqual({ awarded: true, withdrawn: false, todayClaimed: false })
    expect((await liveCompletions(d)).map((c) => c.cardId)).toEqual([b])
  })

  it('deletes a column by moving its cards, never below two columns', async () => {
    const d = freshDb()
    const p = await project(d)
    const x = await addCard(p.id, p.todo, 'X', NOW, d)
    const y = await addCard(p.id, p.todo, 'Y', NOW, d)
    await addCard(p.id, p.doing, 'Z', NOW, d)
    await expect(deleteColumn(p.todo, p.todo, NOW, d)).rejects.toThrow(QuestError)
    const other = await project(d, 'mq')
    await expect(deleteColumn(p.todo, other.todo, NOW, d)).rejects.toThrow(QuestError)

    await deleteColumn(p.todo, p.doing, NOW, d)
    let s = await board(d, p.id)
    expect(s.columns.map((c) => [c.title, c.order])).toEqual([['In progress', 0], ['Done', 1]])
    expect(await titles(d, p.id, p.doing)).toEqual(['Z', 'X', 'Y'])
    expect(s.cardsByColumn[p.doing].map((c) => c.order)).toEqual([0, 1, 2])
    expect((await d.cards.get(x))?.columnId).toBe(p.doing)
    expect((await d.boardColumns.get(p.todo))?.deletedAt).toBeTruthy()
    await expect(deleteColumn(p.doing, p.done, NOW, d)).rejects.toThrow(/at least 2/)
    expect(await liveCompletions(d)).toHaveLength(0)

    // Deleting the done column: its cards move to the column that becomes done → completions kept.
    await addColumn(p.id, 'Review', undefined, NOW, d) // In progress / Review / Done
    await moveCard(y, p.done, 0, NOW, d)
    const review = (await board(d, p.id)).columns[1].id
    await deleteColumn(p.done, review, NOW, d)
    s = await board(d, p.id)
    expect(s.doneColumnId).toBe(review)
    expect((await liveCompletions(d)).map((c) => c.cardId)).toEqual([y])
  })

  it('deleting the done column into a non-done column withdraws today’s completions, keeps earlier ones', async () => {
    const d = freshDb()
    const p = await project(d)
    const old = await addCard(p.id, p.done, 'Old', NOW, d)
    await addColumn(p.id, 'Review', undefined, NOW, d)
    await addCard(p.id, p.done, 'Fresh', at(day(1)), d)
    await deleteColumn(p.done, p.todo, at(day(1)), d) // Review becomes done; cards go to To do
    const live = await liveCompletions(d)
    expect(live.map((c) => c.cardId)).toEqual([old])
    expect(live[0].dayKey).toBe(D0)
    expect(await titles(d, p.id, p.todo)).toEqual(['Old', 'Fresh'])
  })
})

describe('cards', () => {
  it('appends, reorders within a column stably, and never awards for reorders', async () => {
    const d = freshDb()
    const p = await project(d)
    const ids = []
    for (const t of ['A', 'B', 'C', 'D']) ids.push(await addCard(p.id, p.todo, t, NOW, d))
    await moveCard(ids[3], p.todo, 0, NOW, d)
    expect(await titles(d, p.id, p.todo)).toEqual(['D', 'A', 'B', 'C'])
    await moveCard(ids[3], p.todo, 2, NOW, d)
    expect(await titles(d, p.id, p.todo)).toEqual(['A', 'B', 'D', 'C'])
    await moveCard(ids[0], p.todo, 99, NOW, d)
    expect(await titles(d, p.id, p.todo)).toEqual(['B', 'D', 'C', 'A'])
    expect((await board(d, p.id)).cardsByColumn[p.todo].map((c) => c.order)).toEqual([0, 1, 2, 3])
    await moveCard(ids[2], p.doing, 0, NOW, d)
    expect(await titles(d, p.id, p.todo)).toEqual(['B', 'D', 'A'])
    expect((await board(d, p.id)).cardsByColumn[p.todo].map((c) => c.order)).toEqual([0, 1, 2])
    expect(await d.questCompletions.count()).toBe(0)
  })

  it('awards one card completion today when entering done, in the parent category', async () => {
    const d = freshDb()
    const p = await project(d, 'mq')
    const c = await addCard(p.id, p.todo, 'Add login/logout', NOW, d)
    expect(await moveCard(c, p.done, 0, NOW, d)).toEqual({ awarded: true, withdrawn: false, todayClaimed: false })
    const [comp] = await liveCompletions(d)
    expect(comp).toMatchObject({ id: `card:${c}`, questId: p.id, cardId: c, kind: 'card', units: 1, category: 'mq', dayKey: D0 })
    expect((await d.cards.get(c))?.doneAt).toBe(NOW.toISOString())
    expect(isQuestDone((await d.quests.get(p.id))!, await liveCompletions(d), NOW)).toBe(false)
    expect((await board(d, p.id)).progress).toEqual({ done: 1, total: 1 })
  })

  it('same day: out of done withdraws, back in re-awards — never two live completions', async () => {
    const d = freshDb()
    const p = await project(d)
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    await moveCard(c, p.done, 0, NOW, d)
    expect(await moveCard(c, p.doing, 0, at(D0, 15), d)).toEqual({ awarded: false, withdrawn: true, todayClaimed: false })
    expect(await liveCompletions(d)).toHaveLength(0)
    await moveCard(c, p.done, 0, at(D0, 16), d)
    await moveCard(c, p.done, 0, at(D0, 17), d) // reorder in done
    expect(await liveCompletions(d)).toHaveLength(1)
    expect(await d.questCompletions.count()).toBe(1) // same row id, re-stamped
  })

  it('a later day: moving out keeps the earned completion and moving back in awards nothing', async () => {
    const d = freshDb()
    const p = await project(d)
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    await moveCard(c, p.done, 0, NOW, d)
    expect(await moveCard(c, p.todo, 0, at(day(1)), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: false })
    expect(await moveCard(c, p.done, 0, at(day(2)), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: false })
    const live = await liveCompletions(d)
    expect(live).toHaveLength(1)
    expect(live[0].dayKey).toBe(D0) // never re-stamped or backdated
    expect((await d.cards.get(c))?.doneAt).toBe(at(day(2)).toISOString()) // last entered done
  })

  it('keeps a card’s completion once it is claimed', async () => {
    const d = freshDb()
    const p = await project(d)
    const c = await addCard(p.id, p.done, 'C', NOW, d)
    expect((await claimAll(d, NOW, normal)).days).toEqual([D0])
    expect(await moveCard(c, p.todo, 0, at(D0, 18), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: true })
    expect(await deleteCard(c, at(D0, 19), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: true })
    expect(await liveCompletions(d)).toHaveLength(1)
  })

  it('cards finished after today’s claim still earn, and can be withdrawn until claimed', async () => {
    const d = freshDb()
    const p = await project(d)
    const first = await addCard(p.id, p.done, 'First', NOW, d)
    await claimAll(d, NOW, normal)
    expect(await status(d, D0, at(D0, 19))).toBe('claimed')
    const late = await addCard(p.id, p.todo, 'Late', at(D0, 20), d)
    expect(await moveCard(late, p.done, 0, at(D0, 21), d)).toEqual({ awarded: true, withdrawn: false, todayClaimed: false })
    expect(await status(d, D0, at(D0, 21))).toBe('ready')
    // The new one is unclaimed, so it can still move back out; the claimed one can't.
    expect(await moveCard(late, p.todo, 0, at(D0, 21), d)).toEqual({ awarded: false, withdrawn: true, todayClaimed: false })
    expect(await status(d, D0, at(D0, 21))).toBe('claimed')
    expect(await moveCard(first, p.todo, 0, at(D0, 21), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: true })
    expect(await moveCard(first, p.done, 0, at(D0, 21), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: true })
    expect(await moveCard(late, p.done, 0, at(D0, 22), d)).toMatchObject({ awarded: true })
    const r = await claimAll(d, at(D0, 23), normal)
    expect(r.days).toEqual([D0])
    expect(r.stones.map((s) => [s.category, s.weight])).toEqual([['sq', 1]])
    expect(await moveCard(late, p.todo, 0, at(D0, 23), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: true })
    expect((await d.dayClaims.get(D0))?.weight).toBe(2)
  })

  it('deleting a card withdraws only today’s unclaimed completion', async () => {
    const d = freshDb()
    const p = await project(d)
    const a = await addCard(p.id, p.done, 'A', NOW, d)
    const b = await addCard(p.id, p.done, 'B', at(day(1)), d)
    expect(await deleteCard(b, at(day(1)), d)).toEqual({ awarded: false, withdrawn: true, todayClaimed: false })
    expect(await deleteCard(a, at(day(1)), d)).toEqual({ awarded: false, withdrawn: false, todayClaimed: false })
    expect((await liveCompletions(d)).map((c) => c.cardId)).toEqual([a])
    expect((await board(d, p.id)).progress).toEqual({ done: 0, total: 0 })
    await expect(moveCard(a, p.todo, 0, NOW, d)).rejects.toThrow(/not found/)
  })

  it('refuses cross-board moves and edits cards', async () => {
    const d = freshDb()
    const p = await project(d)
    const q = await project(d, 'mq')
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    await expect(moveCard(c, q.todo, 0, NOW, d)).rejects.toThrow(QuestError)
    await expect(addCard(p.id, q.todo, 'X', NOW, d)).rejects.toThrow(QuestError)
    await expect(addCard(p.id, p.todo, ' ', NOW, d)).rejects.toThrow(QuestError)
    await updateCard(c, { title: ' Login ', note: 'OAuth', dueDate: day(4) }, NOW, d)
    expect(await d.cards.get(c)).toMatchObject({ title: 'Login', note: 'OAuth', dueDate: day(4) })
    await updateCard(c, { note: null, dueDate: null }, NOW, d)
    const card = (await d.cards.get(c))!
    expect(card.note).toBeUndefined()
    expect(card.dueDate).toBeUndefined()
    await expect(updateCard(c, { dueDate: 'soon' }, NOW, d)).rejects.toThrow(QuestError)
  })

  it('card due dates are reminders only: they never block a day', async () => {
    const d = freshDb()
    const p = await project(d)
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    await updateCard(c, { dueDate: D0 }, NOW, d)
    expect(await status(d, D0, NOW)).toBe('empty')
  })
})

describe('subtasks', () => {
  it('adds, toggles, renames, reorders and deletes without earning anything', async () => {
    const d = freshDb()
    const p = await project(d)
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    const [s1, s2, s3] = [await addSubtask(c, 'Form', NOW, d), await addSubtask(c, 'API', NOW, d), await addSubtask(c, 'Tests', NOW, d)]
    await toggleSubtask(c, s1, undefined, NOW, d)
    await toggleSubtask(c, s2, true, NOW, d)
    await toggleSubtask(c, s2, true, NOW, d) // explicit value is idempotent
    await renameSubtask(c, s3, 'E2E tests', NOW, d)
    await moveSubtask(c, s3, 0, NOW, d)
    let subs = (await d.cards.get(c))!.subtasks
    expect(subs.map((s) => [s.title, s.done])).toEqual([['E2E tests', false], ['Form', true], ['API', true]])
    await toggleSubtask(c, s1, undefined, NOW, d)
    await deleteSubtask(c, s2, NOW, d)
    subs = (await d.cards.get(c))!.subtasks
    expect(subs.map((s) => [s.id, s.done])).toEqual([[s3, false], [s1, false]])
    await expect(toggleSubtask(c, 'nope', undefined, NOW, d)).rejects.toThrow(QuestError)
    await expect(addSubtask(c, '', NOW, d)).rejects.toThrow(QuestError)
    expect(await d.questCompletions.count()).toBe(0)
  })
})

describe('complete / reopen project', () => {
  it('awards a 3-unit bonus, withdraws it on a same-day reopen, and never double-awards', async () => {
    const d = freshDb()
    const p = await project(d)
    expect(await completeProject(p.id, NOW, d)).toBe(true)
    let q = (await d.quests.get(p.id))!
    expect(q.projectDoneAt).toBe(NOW.toISOString())
    expect(isQuestDone(q, [], NOW)).toBe(true)
    expect(await liveCompletions(d)).toMatchObject([{ id: `project:${p.id}`, kind: 'project', units: 3, category: 'sq', dayKey: D0 }])
    await expect(completeProject(p.id, NOW, d)).rejects.toThrow(QuestError)

    expect(await reopenProject(p.id, at(D0, 15), d)).toBe(true) // same day, unclaimed
    q = (await d.quests.get(p.id))!
    expect(q.projectDoneAt).toBeUndefined()
    expect(await liveCompletions(d)).toHaveLength(0)
    await expect(reopenProject(p.id, NOW, d)).rejects.toThrow(QuestError)

    expect(await completeProject(p.id, at(D0, 16), d)).toBe(true)
    expect(await reopenProject(p.id, at(day(1)), d)).toBe(false) // a later day: bonus stays
    expect(await completeProject(p.id, at(day(2)), d)).toBe(false) // and isn't re-awarded
    const live = await liveCompletions(d)
    expect(live).toHaveLength(1)
    expect(live[0].dayKey).toBe(D0)
  })

  it('keeps the bonus on reopen once today is claimed', async () => {
    const d = freshDb()
    const p = await project(d)
    await completeProject(p.id, NOW, d)
    await claimAll(d, NOW, normal)
    expect(await reopenProject(p.id, at(D0, 20), d)).toBe(false)
    expect(await liveCompletions(d)).toHaveLength(1)
  })
})

describe('claim integration', () => {
  it('a card done today makes today ready when nothing else is pending; stones use the parent category', async () => {
    const d = freshDb()
    const p = await project(d, 'mq')
    const c = await addCard(p.id, p.todo, 'C', NOW, d)
    expect(await status(d, D0, NOW)).toBe('empty')
    await moveCard(c, p.done, 0, NOW, d)
    expect(await status(d, D0, NOW)).toBe('ready')
    const r = await claimAll(d, NOW, normal)
    expect(r.days).toEqual([D0])
    expect(r.stones.map((s) => [s.category, s.weight])).toEqual([['mq', 1]])
    expect((await d.dayClaims.get(D0))?.weight).toBe(1)
  })

  it('stays pending while assigned quests are open', async () => {
    const d = freshDb()
    const p = await project(d)
    await createQuest({ category: 'dq', title: 'Stretch' }, NOW, d)
    await addCard(p.id, p.done, 'C', NOW, d)
    expect(await status(d, D0, NOW)).toBe('pending')
    expect((await claimAll(d, NOW, normal)).days).toEqual([])
  })

  it('the project bonus produces weight per units', async () => {
    const d = freshDb()
    const p = await project(d)
    await addCard(p.id, p.done, 'A', NOW, d)
    await addCard(p.id, p.done, 'B', NOW, d)
    await completeProject(p.id, NOW, d)
    const r = await claimAll(d, NOW, normal)
    expect(r.stones.map((s) => [s.category, s.weight])).toEqual([['sq', 3], ['sq', 2]])
    expect((await d.dayClaims.get(D0))?.weight).toBe(5)
    // A card finished after the claim makes today ready again and drops just its own stone.
    await addCard(p.id, p.done, 'Late', at(D0, 22), d)
    const again = await claimAll(d, at(D0, 23), normal)
    expect(again.days).toEqual([D0])
    expect(again.stones.map((s) => [s.category, s.weight])).toEqual([['sq', 1]])
    expect((await d.dayClaims.get(D0))?.weight).toBe(6)
    expect((await claimAll(d, at(D0, 23), normal)).days).toEqual([])
  })

  it('a project completed after today’s claim earns its bonus on the next claim; reopen is refused once claimed', async () => {
    const d = freshDb()
    const p = await project(d)
    await addCard(p.id, p.done, 'A', NOW, d)
    await claimAll(d, NOW, normal)
    expect(await completeProject(p.id, at(D0, 15), d)).toBe(true)
    expect(await status(d, D0, at(D0, 15))).toBe('ready')
    expect(await reopenProject(p.id, at(D0, 16), d)).toBe(true) // unclaimed: withdrawn
    expect(await status(d, D0, at(D0, 16))).toBe('claimed')
    expect(await completeProject(p.id, at(D0, 17), d)).toBe(true)
    const r = await claimAll(d, at(D0, 18), normal)
    expect(r.stones.map((s) => [s.category, s.weight])).toEqual([['sq', 3]])
    expect(await reopenProject(p.id, at(D0, 19), d)).toBe(false) // claimed: the bonus stays
    expect(await completeProject(p.id, at(D0, 20), d)).toBe(false) // and can't earn again
    expect((await claimAll(d, at(D0, 21), normal)).days).toEqual([])
  })
})

describe('deleting a project', () => {
  it('soft-deletes its columns and cards, withdraws today’s unclaimed card/bonus, keeps past ones', async () => {
    const d = freshDb()
    const p = await project(d)
    const old = await addCard(p.id, p.done, 'Old', NOW, d)
    await addCard(p.id, p.done, 'Today', at(day(1)), d)
    await addCard(p.id, p.todo, 'Open', at(day(1)), d)
    await completeProject(p.id, at(day(1)), d)
    await deleteQuest(p.id, at(day(1), 18), d)
    expect((await d.boardColumns.toArray()).every((c) => c.deletedAt)).toBe(true)
    expect((await d.cards.toArray()).every((c) => c.deletedAt)).toBe(true)
    expect((await liveCompletions(d)).map((c) => c.cardId)).toEqual([old])
    expect(await loadBoard(p.id, d)).toBeNull()
    expect(await loadProjects(d)).toEqual([])
  })
})

describe('reads', () => {
  it('summarises projects with progress, column count, next card and last activity', async () => {
    const d = freshDb()
    const p = await project(d)
    const m = await project(d, 'mq')
    await addCard(p.id, p.doing, 'Second', NOW, d)
    await addCard(p.id, p.todo, 'First', NOW, d)
    await addCard(p.id, p.done, 'Shipped', at(D0, 14), d)
    await createQuest({ category: 'sq', title: 'Not a project' }, NOW, d)
    const list = await loadProjects(d)
    expect(list.map((x) => x.quest.id)).toEqual([m.id, p.id])
    const s = list[1]
    expect(s).toMatchObject({ done: 1, total: 3, columns: 3 })
    expect(s.nextCard?.title).toBe('First')
    expect(s.lastActivity).toBe(at(D0, 14).toISOString())
    expect(list[0]).toMatchObject({ done: 0, total: 0, columns: 3, nextCard: undefined })
    const b = await board(d, p.id)
    expect(Object.keys(b.cardsByColumn).sort()).toEqual([p.todo, p.doing, p.done].sort())
  })
})
