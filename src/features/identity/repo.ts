// "Who I'm becoming": identity statements, with quests and projects linked to them (Quest.identityId). Every finished
// linked quest is a vote for that identity. Soft deletes and stamped writes keep it sync-ready.
import { db, getDeviceId, newId, newMeta, touch, type MarbleDB } from '../../db/db'
import type { Identity, Quest, QuestCompletion } from '../../db/types'
import { addDaysToKey, dayKey, parseDayKey } from '../quests/day'
import { QuestError } from '../quests/errors'
import { sortQuests } from '../quests/repo'

export const STATEMENT_MAX = 120

function cleanStatement(s: string, outcome = false): string {
  const t = s.trim().replace(/\s+/g, ' ').slice(0, STATEMENT_MAX)
  if (!t) throw new QuestError(outcome ? 'Name the goal first.' : 'Write who you’re becoming first.')
  return t
}

export function isOutcome(i: Pick<Identity, 'kind'>): boolean {
  return i.kind === 'outcome'
}

// How a goal reads in a sentence: an outcome by its name, an identity as "becoming …".
export function goalLabel(i: Pick<Identity, 'kind' | 'statement'>): string {
  return isOutcome(i) ? i.statement : `becoming ${i.statement}`
}

async function getLive(id: string, database: MarbleDB): Promise<Identity | undefined> {
  const i = await database.identities.get(id)
  return i && !i.deletedAt ? i : undefined
}

export async function listIdentities(database: MarbleDB = db): Promise<Identity[]> {
  const all = await database.identities.filter((i) => !i.deletedAt).toArray()
  return all.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
}

export async function createIdentity(statement: string, why = '', now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const id = newId()
  await database.transaction('rw', database.identities, async () => {
    const list = await listIdentities(database)
    const identity: Identity = {
      id,
      statement: cleanStatement(statement),
      order: list.length ? Math.max(...list.map((i) => i.order)) + 1 : 0,
      ...newMeta(now.toISOString()),
    }
    if (why.trim()) identity.why = why.trim()
    await database.identities.add(identity)
  })
  return id
}

// An outcome goal: something with a finish line, and optionally a day to reach it by.
export async function createGoal(input: { title: string; why?: string; targetDate?: string }, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const id = newId()
  await database.transaction('rw', database.identities, async () => {
    const list = await listIdentities(database)
    const goal: Identity = {
      id,
      statement: cleanStatement(input.title, true),
      order: list.length ? Math.max(...list.map((i) => i.order)) + 1 : 0,
      kind: 'outcome',
      ...newMeta(now.toISOString()),
    }
    if (input.why?.trim()) goal.why = input.why.trim()
    if (input.targetDate) goal.targetDate = input.targetDate
    await database.identities.add(goal)
  })
  return id
}

// `targetDate: null` clears it (outcomes only; ignored on identities).
export async function updateIdentity(
  id: string,
  patch: { statement?: string; why?: string; targetDate?: string | null },
  now: Date = new Date(),
  database: MarbleDB = db,
): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const cur = await getLive(id, database)
    if (!cur) return
    const next = { ...cur }
    if (patch.statement !== undefined) next.statement = cleanStatement(patch.statement, isOutcome(cur))
    if (patch.why !== undefined) {
      if (patch.why.trim()) next.why = patch.why.trim()
      else delete next.why
    }
    if (patch.targetDate !== undefined && isOutcome(cur)) {
      if (patch.targetDate) next.targetDate = patch.targetDate
      else delete next.targetDate
    }
    if (next.statement === cur.statement && next.why === cur.why && next.targetDate === cur.targetDate) return
    await database.identities.put(touch(next, now.toISOString()))
  })
}

// Marks an outcome reached (or, with false, open again). Its quests and history stay.
export async function setAchieved(id: string, achieved: boolean, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const cur = await getLive(id, database)
    if (!cur || !isOutcome(cur) || !!cur.achievedAt === achieved) return
    const next = touch(cur, now.toISOString())
    if (achieved) next.achievedAt = now.toISOString()
    else delete next.achievedAt
    await database.identities.put(next)
  })
}

// Soft delete; linked quests keep their identityId, which simply reads as unlinked (and comes back on restore).
export async function deleteIdentity(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const cur = await getLive(id, database)
    if (!cur) return
    await database.identities.put({ ...touch(cur, now.toISOString()), deletedAt: now.toISOString() })
  })
}

export async function restoreIdentity(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const cur = await database.identities.get(id)
    if (!cur?.deletedAt) return
    const next = touch(cur, now.toISOString())
    delete next.deletedAt
    await database.identities.put(next)
  })
}

export async function moveIdentity(id: string, direction: -1 | 1, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const list = await listIdentities(database)
    const i = list.findIndex((x) => x.id === id)
    const other = list[i + direction]
    if (i < 0 || !other) return
    const stamp = { updatedAt: now.toISOString(), deviceId: getDeviceId() }
    await database.identities.update(list[i].id, { order: other.order, ...stamp })
    await database.identities.update(other.id, { order: list[i].order, ...stamp })
  })
}

// Links (or, with null, unlinks) a live quest. A quest votes for at most one identity.
export async function linkQuest(questId: string, identityId: string | null, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.quests, database.identities, async () => {
    const q = await database.quests.get(questId)
    if (!q || q.deletedAt) return
    if (identityId && !(await getLive(identityId, database))) return
    if ((q.identityId ?? null) === identityId) return
    const next = touch(q, now.toISOString())
    if (identityId) next.identityId = identityId
    else delete next.identityId
    await database.quests.put(next)
  })
}

export const VOTE_WINDOW_DAYS = 30
export const WEEK_DAYS = 7
export const QUIET_AFTER_DAYS = 3 // a goal nothing was done for in this many days is "quiet": worth a look, not a failure

export interface IdentityView {
  identity: Identity
  quests: Quest[] // live linked quests and projects, in list order
  votes: number // completions of linked quests (incl. project stages) in the last VOTE_WINDOW_DAYS days
  totalVotes: number
  lastVote?: string // dayKey
  week: boolean[] // the last WEEK_DAYS days, oldest first, today last: was anything done for it that day
  weekVotes: number
  quietDays?: number // days since the last vote (0 = today); unset when it has none yet
  daysLeft?: number // outcomes with a target day: days until it (negative = past)
}

// Pure: each identity with its live linked quests and the "votes" they've cast. Links to deleted identities are ignored.
export function buildIdentityViews(identities: Identity[], quests: Quest[], completions: QuestCompletion[], now: Date): IdentityView[] {
  const today = dayKey(now)
  const since = addDaysToKey(today, -(VOTE_WINDOW_DAYS - 1))
  const weekKeys = Array.from({ length: WEEK_DAYS }, (_, i) => addDaysToKey(today, i - (WEEK_DAYS - 1)))
  const questIdentity = new Map(quests.filter((q) => q.identityId).map((q) => [q.id, q.identityId!]))
  return identities.map((identity) => {
    const linked = sortQuests(quests.filter((q) => !q.deletedAt && q.identityId === identity.id))
    let votes = 0
    let totalVotes = 0
    let lastVote: string | undefined
    const days = new Set<string>()
    let weekVotes = 0
    for (const c of completions) {
      if (c.deletedAt || c.dayKey > today || questIdentity.get(c.questId) !== identity.id) continue
      totalVotes++
      if (c.dayKey >= since) votes++
      if (c.dayKey >= weekKeys[0]) {
        weekVotes++
        days.add(c.dayKey)
      }
      if (!lastVote || c.dayKey > lastVote) lastVote = c.dayKey
    }
    const view: IdentityView = { identity, quests: linked, votes, totalVotes, lastVote, week: weekKeys.map((k) => days.has(k)), weekVotes }
    if (lastVote) view.quietDays = daysBetween(lastVote, today)
    if (isOutcome(identity) && identity.targetDate) view.daysLeft = daysBetween(today, identity.targetDate)
    return view
  })
}

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseDayKey(toKey).getTime() - parseDayKey(fromKey).getTime()) / 86_400_000)
}

// Goals still being worked toward (achieved outcomes are filed away).
export function activeGoals(views: IdentityView[]): IdentityView[] {
  return views.filter((v) => !v.identity.achievedAt)
}

// Has linked quests, and nothing was done for it lately (or ever): the goal most likely to be slipping.
export function isQuiet(v: IdentityView): boolean {
  if (v.identity.achievedAt || !v.quests.length) return false
  return v.quietDays === undefined ? true : v.quietDays >= QUIET_AFTER_DAYS
}

// One line of standing for a goal: the deadline when it's close, a plain note when it's gone quiet, else this week's count.
export function goalStanding(v: IdentityView): { text: string; tone: 'calm' | 'soon' | 'quiet' } {
  if (!v.quests.length) return { text: 'No quests linked yet', tone: 'quiet' }
  if (v.daysLeft !== undefined && v.daysLeft <= 14) {
    if (v.daysLeft < 0) return { text: 'Target day passed', tone: 'quiet' }
    return { text: v.daysLeft === 0 ? 'Target day is today' : v.daysLeft === 1 ? '1 day left' : `${v.daysLeft} days left`, tone: 'soon' }
  }
  if (isQuiet(v)) return { text: v.quietDays === undefined ? 'Not started yet' : `Quiet for ${v.quietDays} days`, tone: 'quiet' }
  if (v.weekVotes > 0) return { text: `${v.weekVotes} this week`, tone: 'calm' }
  return { text: v.daysLeft !== undefined ? `${v.daysLeft} days left` : 'Nothing yet this week', tone: 'calm' }
}
