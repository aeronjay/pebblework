import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { createNote, deleteNote, editedLabel, listNotes, matchesQuery, noteHeading, notePreview, restoreNote, togglePin, updateNote } from './repo'

const t = (min: number) => new Date(Date.UTC(2026, 10, 3, 12, min))

describe('notes repo', () => {
  it('creates a note with sync metadata', async () => {
    const d = freshDb()
    const id = await createNote({ title: 'Plan', body: 'Ship it' }, t(0), d)
    const note = await d.notes.get(id)
    expect(note).toMatchObject({ title: 'Plan', body: 'Ship it', createdAt: t(0).toISOString(), updatedAt: t(0).toISOString() })
    expect(note?.deviceId).toBeTruthy()
    expect(note && 'questId' in note).toBe(false)
  })

  it('updates fields and stamps updatedAt; no-ops when nothing changed', async () => {
    const d = freshDb()
    const id = await createNote({}, t(0), d)
    expect(await updateNote(id, { title: 'A', body: 'B', questId: 'p1' }, t(1), d)).toBe(true)
    expect(await d.notes.get(id)).toMatchObject({ title: 'A', body: 'B', questId: 'p1', updatedAt: t(1).toISOString() })

    expect(await updateNote(id, { title: 'A', body: 'B', questId: 'p1' }, t(2), d)).toBe(false)
    expect((await d.notes.get(id))?.updatedAt).toBe(t(1).toISOString())

    expect(await updateNote(id, { questId: null }, t(3), d)).toBe(true)
    const note = await d.notes.get(id)
    expect(note?.questId).toBeUndefined()
    expect(note?.updatedAt).toBe(t(3).toISOString())
    expect(await d.notes.where('questId').equals('p1').count()).toBe(0)
  })

  it('soft-deletes and drops later writes to a deleted note', async () => {
    const d = freshDb()
    const id = await createNote({ title: 'Gone' }, t(0), d)
    await deleteNote(id, t(1), d)
    expect(await d.notes.get(id)).toMatchObject({ deletedAt: t(1).toISOString(), updatedAt: t(1).toISOString() })
    expect(await listNotes(d)).toEqual([])
    expect(await updateNote(id, { title: 'Back' }, t(2), d)).toBe(false)
    expect(await togglePin(id, t(2), d)).toBe(false)
    expect(await d.notes.get(id)).toMatchObject({ title: 'Gone', updatedAt: t(1).toISOString() })

    await restoreNote(id, t(3), d)
    const restored = await d.notes.get(id)
    expect(restored?.deletedAt).toBeUndefined()
    expect(restored?.updatedAt).toBe(t(3).toISOString())
    expect((await listNotes(d)).map((n) => n.id)).toEqual([id])
  })

  it('toggles pin and stamps the change', async () => {
    const d = freshDb()
    const id = await createNote({}, t(0), d)
    expect(await togglePin(id, t(1), d)).toBe(true)
    expect(await d.notes.get(id)).toMatchObject({ pinned: true, updatedAt: t(1).toISOString() })
    expect(await togglePin(id, t(2), d)).toBe(false)
    const note = await d.notes.get(id)
    expect(note?.pinned).toBeUndefined()
    expect(note?.updatedAt).toBe(t(2).toISOString())
  })

  it('lists pinned first, then most recently edited', async () => {
    const d = freshDb()
    const a = await createNote({ title: 'a' }, t(0), d)
    const b = await createNote({ title: 'b' }, t(1), d)
    const c = await createNote({ title: 'c' }, t(2), d)
    await togglePin(a, t(3), d)
    await updateNote(b, { body: 'newer' }, t(4), d)
    expect((await listNotes(d)).map((n) => n.id)).toEqual([a, b, c])
  })

  it('searches, labels and previews', () => {
    const n = { title: 'Weekly plan', body: 'Call the vet\nBuy pebbles' }
    expect(matchesQuery(n, 'VET')).toBe(true)
    expect(matchesQuery(n, 'weekly')).toBe(true)
    expect(matchesQuery(n, 'gym')).toBe(false)
    expect(matchesQuery(n, '  ')).toBe(true)
    expect(noteHeading(n)).toBe('Weekly plan')
    expect(noteHeading({ title: ' ', body: '\nFirst line\nrest' })).toBe('First line')
    expect(noteHeading({ title: '', body: '' })).toBe('Untitled note')
    expect(notePreview({ title: '', body: 'First\nSecond  line' })).toBe('Second line')
    expect(notePreview(n)).toBe('Call the vet Buy pebbles')
    expect(editedLabel(t(0).toISOString(), t(0))).toBe('Edited just now')
    expect(editedLabel(t(0).toISOString(), t(5))).toBe('Edited 5 minutes ago')
  })
})
