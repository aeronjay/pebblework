// Notes: free-form text, optionally linked to a project quest. Soft deletes and stamped writes keep it sync-ready.
import { formatDistanceStrict } from 'date-fns'
import { db, newId, newMeta, touch, type MarbleDB } from '../../db/db'
import type { Note } from '../../db/types'

// `null` clears the project link.
export interface NotePatch {
  title?: string
  body?: string
  questId?: string | null
}

export interface NewNote {
  title?: string
  body?: string
  questId?: string
}

async function getLive(id: string, database: MarbleDB): Promise<Note | undefined> {
  const note = await database.notes.get(id)
  return note && !note.deletedAt ? note : undefined
}

export async function createNote(input: NewNote = {}, now: Date = new Date(), database: MarbleDB = db): Promise<string> {
  const id = newId()
  const note: Note = { id, title: input.title ?? '', body: input.body ?? '', ...newMeta(now.toISOString()) }
  if (input.questId) note.questId = input.questId
  await database.notes.add(note)
  return id
}

// No-op (no updatedAt bump) when nothing changed, so autosave flushes don't reorder the list or create sync noise.
// Returns whether the note was written; writes to a missing or deleted note are dropped.
export async function updateNote(id: string, patch: NotePatch, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', database.notes, async () => {
    const note = await getLive(id, database)
    if (!note) return false
    const next: Note = { ...note }
    let changed = false
    if (patch.title !== undefined && patch.title !== note.title) {
      next.title = patch.title
      changed = true
    }
    if (patch.body !== undefined && patch.body !== note.body) {
      next.body = patch.body
      changed = true
    }
    if (patch.questId !== undefined && (patch.questId || undefined) !== note.questId) {
      if (patch.questId) next.questId = patch.questId
      else delete next.questId
      changed = true
    }
    if (!changed) return false
    await database.notes.put(touch(next, now.toISOString()))
    return true
  })
}

// Soft delete, so the deletion can sync.
export async function deleteNote(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const note = await getLive(id, database)
    if (!note) return
    await database.notes.put({ ...touch(note, now.toISOString()), deletedAt: now.toISOString() })
  })
}

// Undo for deleteNote.
export async function restoreNote(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(id)
    if (!note?.deletedAt) return
    const next = touch(note, now.toISOString())
    delete next.deletedAt
    await database.notes.put(next)
  })
}

// Returns the new pinned state.
export async function togglePin(id: string, now: Date = new Date(), database: MarbleDB = db): Promise<boolean> {
  return database.transaction('rw', database.notes, async () => {
    const note = await getLive(id, database)
    if (!note) return false
    const next = touch(note, now.toISOString())
    if (note.pinned) delete next.pinned
    else next.pinned = true
    await database.notes.put(next)
    return !!next.pinned
  })
}

// Live notes: pinned first, then most recently edited.
export async function listNotes(database: MarbleDB = db): Promise<Note[]> {
  const notes = await database.notes.filter((n) => !n.deletedAt).toArray()
  return notes.sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )
}

export function matchesQuery(note: Pick<Note, 'title' | 'body'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return note.title.toLowerCase().includes(q) || note.body.toLowerCase().includes(q)
}

// "Edited just now" / "Edited 5 minutes ago".
export function editedLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (now.getTime() - then.getTime() < 60_000) return 'Edited just now'
  return `Edited ${formatDistanceStrict(then, now, { addSuffix: true })}`
}

// List heading: the title, else the body's first line.
export function noteHeading(note: Pick<Note, 'title' | 'body'>): string {
  return note.title.trim() || note.body.trim().split('\n')[0].trim() || 'Untitled note'
}

// List preview: the body (minus the line already used as the heading), on one line.
export function notePreview(note: Pick<Note, 'title' | 'body'>): string {
  const body = note.body.trim()
  const text = note.title.trim() ? body : body.split('\n').slice(1).join(' ')
  return text.replace(/\s+/g, ' ').trim()
}
