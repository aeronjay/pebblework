// "Who I'm becoming": identity statements, with quests and projects linked to them (Quest.identityId). Every finished
// linked quest is a vote for that identity. Soft deletes and stamped writes keep it sync-ready.
import { db, getDeviceId, newId, newMeta, touch, type MarbleDB } from '../../db/db'
import type { Identity, Quest, QuestCompletion } from '../../db/types'
import { addDaysToKey, dayKey } from '../quests/day'
import { QuestError } from '../quests/errors'
import { sortQuests } from '../quests/repo'

export const STATEMENT_MAX = 120

function cleanStatement(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ').slice(0, STATEMENT_MAX)
  if (!t) throw new QuestError('Write who you’re becoming first.')
  return t
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

export async function updateIdentity(id: string, patch: { statement?: string; why?: string }, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.identities, async () => {
    const cur = await getLive(id, database)
    if (!cur) return
    const next = { ...cur }
    if (patch.statement !== undefined) next.statement = cleanStatement(patch.statement)
    if (patch.why !== undefined) {
      if (patch.why.trim()) next.why = patch.why.trim()
      else delete next.why
    }
    if (next.statement === cur.statement && next.why === cur.why) return
    await database.identities.put(touch(next, now.toISOString()))
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

export interface IdentityView {
  identity: Identity
  quests: Quest[] // live linked quests and projects, in list order
  votes: number // completions of linked quests (incl. project stages) in the last VOTE_WINDOW_DAYS days
  totalVotes: number
  lastVote?: string // dayKey
}

// Pure: each identity with its live linked quests and the "votes" they've cast. Links to deleted identities are ignored.
export function buildIdentityViews(identities: Identity[], quests: Quest[], completions: QuestCompletion[], now: Date): IdentityView[] {
  const today = dayKey(now)
  const since = addDaysToKey(today, -(VOTE_WINDOW_DAYS - 1))
  const questIdentity = new Map(quests.filter((q) => q.identityId).map((q) => [q.id, q.identityId!]))
  return identities.map((identity) => {
    const linked = sortQuests(quests.filter((q) => !q.deletedAt && q.identityId === identity.id))
    let votes = 0
    let totalVotes = 0
    let lastVote: string | undefined
    for (const c of completions) {
      if (c.deletedAt || c.dayKey > today || questIdentity.get(c.questId) !== identity.id) continue
      totalVotes++
      if (c.dayKey >= since) votes++
      if (!lastVote || c.dayKey > lastVote) lastVote = c.dayKey
    }
    return { identity, quests: linked, votes, totalVotes, lastVote }
  })
}
