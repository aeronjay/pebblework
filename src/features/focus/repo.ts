// Focus sessions: one task, a timer that survives reloads, stray thoughts parked mid-session, and the user's own
// rating at the end. Sessions earn nothing by themselves (time is easy to game); finishing the linked quest or card
// does, through the usual completion path.
import { db, getDeviceId, newId, newMeta, type MarbleDB } from '../../db/db'
import type { FocusRating, FocusSession } from '../../db/types'
import { doneColumnOf, moveCard } from '../board/repo'
import { createNote } from '../notes/repo'
import { QuestError } from '../quests/errors'
import { completeQuest } from '../quests/repo'
import { dayKey } from '../quests/day'

// A single unbroken stretch counts for at most this long, so a session left running overnight doesn't log 14 hours.
export const MAX_STRETCH_MS = 3 * 60 * 60 * 1000
// Shorter sessions are discarded on end: a mis-tap, not a session.
export const MIN_KEEP_MS = 60 * 1000
export const MAX_PARKED_LENGTH = 280

export interface FocusStart {
  task: string
  plannedMin: number // 0 = open-ended
  questId?: string
  cardId?: string
}

function stamp(now: Date) {
  return { updatedAt: now.toISOString(), deviceId: getDeviceId() }
}

// Focused time so far: banked time plus the running stretch (capped).
export function elapsedMs(s: Pick<FocusSession, 'focusMs' | 'resumedAt' | 'endedAt'>, now: Date): number {
  if (!s.resumedAt || s.endedAt) return s.focusMs
  return s.focusMs + Math.min(MAX_STRETCH_MS, Math.max(0, now.getTime() - Date.parse(s.resumedAt)))
}

export function isRunning(s: FocusSession): boolean {
  return !s.endedAt && !!s.resumedAt
}

async function getLive(id: string, database: MarbleDB): Promise<FocusSession | undefined> {
  const s = await database.focusSessions.get(id)
  return s && !s.deletedAt ? s : undefined
}

// The open session (running or paused), if any. Only one is ever open; the newest wins if old data says otherwise.
export async function activeSession(database: MarbleDB = db): Promise<FocusSession | undefined> {
  const open = await database.focusSessions.filter((s) => !s.deletedAt && !s.endedAt).toArray()
  return open.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

// Finished sessions, newest first.
export async function listSessions(database: MarbleDB = db): Promise<FocusSession[]> {
  const done = await database.focusSessions.filter((s) => !s.deletedAt && !!s.endedAt).toArray()
  return done.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

// Starts a running session. Any session still open is ended first.
export async function startSession(input: FocusStart, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const task = input.task.trim()
  if (!task) throw new QuestError('Name the one thing you’re focusing on.')
  const plannedMin = Math.max(0, Math.round(input.plannedMin))
  return database.transaction('rw', database.focusSessions, async () => {
    for (const open of await database.focusSessions.filter((s) => !s.deletedAt && !s.endedAt).toArray()) {
      await endSession(open.id, now, database)
    }
    const iso = now.toISOString()
    const session: FocusSession = {
      id: newId(),
      dayKey: dayKey(now),
      task,
      plannedMin,
      startedAt: iso,
      resumedAt: iso,
      focusMs: 0,
      parked: [],
      awayCount: 0,
      ...newMeta(iso),
    }
    if (input.questId) session.questId = input.questId
    if (input.cardId) session.cardId = input.cardId
    await database.focusSessions.add(session)
    return session.id
  })
}

// Banks the running stretch and stops the clock.
export async function pauseSession(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || !isRunning(s)) return
    const { resumedAt: _, ...rest } = s
    await database.focusSessions.put({ ...rest, focusMs: elapsedMs(s, now), ...stamp(now) })
  })
}

export async function resumeSession(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || s.endedAt || s.resumedAt) return
    await database.focusSessions.put({ ...s, resumedAt: now.toISOString(), ...stamp(now) })
  })
}

// Writes a stray thought down so it stops tugging. Returns false for blank text or a closed session.
export async function parkThought(id: string, text: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  const t = text.trim().slice(0, MAX_PARKED_LENGTH)
  if (!t) return false
  return database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || s.endedAt) return false
    await database.focusSessions.put({ ...s, parked: [...s.parked, t], ...stamp(now) })
    return true
  })
}

// The tab was hidden while the clock ran. Counted, never penalized.
export async function noteAway(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || !isRunning(s)) return
    await database.focusSessions.put({ ...s, awayCount: s.awayCount + 1, ...stamp(now) })
  })
}

// Closes the session and banks its time. Under a minute, it's dropped instead. Returns the ended session, or
// undefined when it was dropped (or wasn't open).
export async function endSession(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<FocusSession | undefined> {
  return database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || s.endedAt) return undefined
    const focusMs = elapsedMs(s, now)
    const { resumedAt: _, ...rest } = s
    const iso = now.toISOString()
    if (focusMs < MIN_KEEP_MS) {
      await database.focusSessions.put({ ...rest, focusMs, endedAt: iso, deletedAt: iso, ...stamp(now) })
      return undefined
    }
    const ended: FocusSession = { ...rest, focusMs, endedAt: iso, ...stamp(now) }
    await database.focusSessions.put(ended)
    return ended
  })
}

export async function rateSession(id: string, rating: FocusRating, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s || s.rating === rating) return
    await database.focusSessions.put({ ...s, rating, ...stamp(now) })
  })
}

export async function deleteSession(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.focusSessions, async () => {
    const s = await getLive(id, database)
    if (!s) return
    await database.focusSessions.put({ ...s, deletedAt: now.toISOString(), ...stamp(now) })
  })
}

export type FinishResult = { done: 'card' | 'quest'; stone: boolean } | false

// Marks the session's task done the normal way: a card moves to its board's done column, a quest is completed for
// today. Either drops a stone to claim on Home (a card only the first time it's ever done). false when there's nothing
// linked or it can't be finished now.
export async function finishLinked(session: Pick<FocusSession, 'questId' | 'cardId'>, now: Date = new Date(), database: MarbleDB = db): Promise<FinishResult> {
  if (session.cardId) {
    const card = await database.cards.get(session.cardId)
    if (!card || card.deletedAt) return false
    const done = doneColumnOf(await database.boardColumns.where('questId').equals(card.questId).toArray())
    if (!done || done.id === card.columnId) return false
    const r = await moveCard(card.id, done.id, Number.MAX_SAFE_INTEGER, now, database)
    return { done: 'card', stone: r.awarded }
  }
  if (session.questId) return (await completeQuest(session.questId, now, database)) ? { done: 'quest', stone: true } : false
  return false
}

// Turns the parked thoughts into a note (linked to the project when the task was a card or project).
export async function saveParkedToNote(session: FocusSession, now: Date = new Date(), database: MarbleDB = db): Promise<string | undefined> {
  if (!session.parked.length) return undefined
  const quest = session.questId ? await database.quests.get(session.questId) : undefined
  return createNote(
    {
      title: `Parked while focusing: ${session.task}`,
      body: session.parked.map((p) => `- ${p}`).join('\n'),
      questId: quest?.isProject && !quest.deletedAt ? quest.id : undefined,
    },
    now,
    database,
  )
}
