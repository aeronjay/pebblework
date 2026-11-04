import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { addCard, createProjectBoard } from '../board/repo'
import { cardCompletionId, completionId, dayKey } from '../quests/day'
import { createQuest } from '../quests/repo'
import {
  activeSession,
  elapsedMs,
  endSession,
  finishLinked,
  listSessions,
  MAX_STRETCH_MS,
  noteAway,
  parkThought,
  pauseSession,
  rateSession,
  resumeSession,
  saveParkedToNote,
  startSession,
} from './repo'

const t = (min: number) => new Date(2026, 10, 4, 9, min)

describe('focus repo', () => {
  it('runs a session: pauses never count, and it ends with the banked time', async () => {
    const d = freshDb()
    const id = await startSession({ task: '  Write intro  ', plannedMin: 25 }, t(0), d)
    const s = (await activeSession(d))!
    expect(s).toMatchObject({ id, task: 'Write intro', plannedMin: 25, dayKey: dayKey(t(0)), focusMs: 0, parked: [], awayCount: 0 })
    expect(elapsedMs(s, t(10))).toBe(10 * 60_000)

    await pauseSession(id, t(10), d)
    const paused = (await activeSession(d))!
    expect(paused.resumedAt).toBeUndefined()
    expect(elapsedMs(paused, t(30))).toBe(10 * 60_000)

    await resumeSession(id, t(30), d)
    const ended = await endSession(id, t(45), d)
    expect(ended?.focusMs).toBe(25 * 60_000)
    expect(ended?.resumedAt).toBeUndefined()
    expect(await activeSession(d)).toBeUndefined()
    expect((await listSessions(d)).map((x) => x.id)).toEqual([id])
  })

  it('rejects a blank task and drops sessions under a minute', async () => {
    const d = freshDb()
    await expect(startSession({ task: '  ', plannedMin: 25 }, t(0), d)).rejects.toThrow()
    const id = await startSession({ task: 'Oops', plannedMin: 25 }, t(0), d)
    expect(await endSession(id, new Date(t(0).getTime() + 30_000), d)).toBeUndefined()
    expect(await listSessions(d)).toEqual([])
    expect(await activeSession(d)).toBeUndefined()
  })

  it('caps a stretch left running for hours', async () => {
    const d = freshDb()
    const id = await startSession({ task: 'Forgot it', plannedMin: 0 }, t(0), d)
    const ended = await endSession(id, new Date(t(0).getTime() + 10 * 60 * 60_000), d)
    expect(ended?.focusMs).toBe(MAX_STRETCH_MS)
  })

  it('starting a session ends the open one', async () => {
    const d = freshDb()
    const first = await startSession({ task: 'One', plannedMin: 25 }, t(0), d)
    const second = await startSession({ task: 'Two', plannedMin: 25 }, t(20), d)
    expect((await activeSession(d))?.id).toBe(second)
    expect((await d.focusSessions.get(first))?.focusMs).toBe(20 * 60_000)
  })

  it('parks thoughts, counts tab-leaves only while running, and keeps a rating', async () => {
    const d = freshDb()
    const id = await startSession({ task: 'Read', plannedMin: 25 }, t(0), d)
    expect(await parkThought(id, '  email Sam  ', t(1), d)).toBe(true)
    expect(await parkThought(id, '   ', t(1), d)).toBe(false)
    await noteAway(id, t(2), d)
    await pauseSession(id, t(3), d)
    await noteAway(id, t(4), d)
    await resumeSession(id, t(5), d)
    const ended = (await endSession(id, t(20), d))!
    expect(ended).toMatchObject({ parked: ['email Sam'], awayCount: 1 })
    expect(await parkThought(id, 'too late', t(21), d)).toBe(false)
    await rateSession(id, 4, t(21), d)
    expect((await d.focusSessions.get(id))?.rating).toBe(4)

    const noteId = await saveParkedToNote(ended, t(22), d)
    expect(await d.notes.get(noteId!)).toMatchObject({ title: 'Parked while focusing: Read', body: '- email Sam' })
  })

  it('finishes a linked quest or card the normal way', async () => {
    const d = freshDb()
    const quest = await createQuest({ category: 'dq', title: 'Stretch' }, t(0), d)
    expect(await finishLinked({ questId: quest }, t(30), d)).toEqual({ done: 'quest', stone: true })
    expect(await d.questCompletions.get(completionId(quest, dayKey(t(30))))).toBeTruthy()
    expect(await finishLinked({ questId: quest }, t(31), d)).toBe(false) // already done today

    const project = await createQuest({ category: 'mq', title: 'Game', isProject: true }, t(0), d)
    const [, doing, done] = await createProjectBoard(project, t(0), d)
    const card = await addCard(project, doing, 'Title screen', t(0), d)
    expect(await finishLinked({ questId: project, cardId: card }, t(40), d)).toEqual({ done: 'card', stone: true })
    expect((await d.cards.get(card))?.columnId).toBe(done)
    expect(await d.questCompletions.get(cardCompletionId(card))).toBeTruthy()
    expect(await finishLinked({ questId: project, cardId: card }, t(41), d)).toBe(false) // already in Done
  })
})
