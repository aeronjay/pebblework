import { describe, expect, it } from 'vitest'
import { freshDb } from '../test/db'
import { DEFAULT_SETTINGS, newId, newMeta } from './db'
import { BACKUP_SCHEMA_VERSION, BackupError, backupDue, exportBackup, importBackup, parseBackup, snoozeBackupReminder } from './backup'
import { claimAll } from '../features/quests/claim'

describe('backup', () => {
  it('round-trips all data through JSON into another database', async () => {
    const source = freshDb()
    const goalId = newId()
    await source.goals.add({ id: goalId, type: 'habit', title: 'Read', color: '#f97316', status: 'active', schedule: { kind: 'daily' }, ...newMeta() })
    await source.checkIns.add({ id: newId(), goalId, at: new Date().toISOString(), mood: 4, ...newMeta() })
    await source.settings.put(DEFAULT_SETTINGS)

    const json = JSON.stringify(await exportBackup(source))

    const target = freshDb()
    await target.goals.add({ id: newId(), type: 'project', title: 'Stale', color: '#000', status: 'active', ...newMeta() })
    await importBackup(parseBackup(json), target)

    const goals = await target.goals.toArray()
    expect(goals).toHaveLength(1)
    expect(goals[0].title).toBe('Read')
    expect(await target.checkIns.count()).toBe(1)
    expect(await target.settings.get('settings')).toEqual({ ...DEFAULT_SETTINGS, lastExportAt: JSON.parse(json).exportedAt })
  })

  it('round-trips quest tables', async () => {
    const source = freshDb()
    const meta = newMeta()
    await source.quests.add({ id: 'q1', category: 'dq', title: 'Stretch', order: 0, startDate: '2026-11-01', ...meta })
    await source.questCompletions.add({ id: 'q1:2026-11-01', questId: 'q1', category: 'dq', dayKey: '2026-11-01', completedAt: meta.createdAt, ...meta })
    await source.dayClaims.add({ dayKey: '2026-11-01', jarId: 'j1', claimedAt: meta.createdAt, weight: 1, ...meta })
    await source.stones.add({ id: 's1', jarId: 'j1', dayKey: '2026-11-01', category: 'dq', weight: 1, rarity: 'normal', at: meta.createdAt, ...meta })

    const backup = parseBackup(JSON.stringify(await exportBackup(source)))
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION)
    const target = freshDb()
    await importBackup(backup, target)
    expect(await target.quests.count()).toBe(1)
    expect(await target.questCompletions.count()).toBe(1)
    expect(await target.dayClaims.get('2026-11-01')).toMatchObject({ jarId: 'j1' })
    expect(await target.stones.count()).toBe(1)
  })

  it('imports v1 backups that predate quests', async () => {
    const target = freshDb()
    await target.quests.add({ id: 'stale', category: 'sq', title: 'Stale', order: 0, startDate: '2026-11-01', ...newMeta() })
    const v1 = { app: 'marble-jar', schemaVersion: 1, exportedAt: new Date().toISOString(), data: { goals: [], settings: [DEFAULT_SETTINGS] } }
    await importBackup(parseBackup(JSON.stringify(v1)), target)
    expect(await target.quests.count()).toBe(0)
    expect(await target.settings.get('settings')).toEqual({ ...DEFAULT_SETTINGS, lastExportAt: v1.exportedAt })
  })

  it('round-trips board tables', async () => {
    const source = freshDb()
    const meta = newMeta()
    await source.quests.add({ id: 'p1', category: 'sq', title: 'Game', order: 0, startDate: '2026-11-01', isProject: true, ...meta })
    await source.boardColumns.add({ id: 'c1', questId: 'p1', title: 'Done', order: 0, ...meta })
    await source.cards.add({ id: 'k1', questId: 'p1', columnId: 'c1', title: 'Login', order: 0, subtasks: [{ id: 't1', title: 'Form', done: true }], ...meta })
    await source.questCompletions.add({ id: 'card:k1', questId: 'p1', category: 'sq', dayKey: '2026-11-01', completedAt: meta.createdAt, kind: 'card', cardId: 'k1', units: 1, ...meta })

    const target = freshDb()
    await importBackup(parseBackup(JSON.stringify(await exportBackup(source))), target)
    expect(await target.boardColumns.count()).toBe(1)
    expect((await target.cards.get('k1'))?.subtasks).toHaveLength(1)
    expect(await target.questCompletions.where('cardId').equals('k1').count()).toBe(1)
  })

  it('round-trips focus sessions', async () => {
    const source = freshDb()
    const meta = newMeta()
    await source.focusSessions.add({
      id: 'f1', dayKey: '2026-11-04', task: 'Write', plannedMin: 25, startedAt: meta.createdAt, endedAt: meta.createdAt,
      focusMs: 1_500_000, rating: 4, parked: ['email'], awayCount: 1, ...meta,
    })
    const target = freshDb()
    await importBackup(parseBackup(JSON.stringify(await exportBackup(source))), target)
    expect(await target.focusSessions.get('f1')).toMatchObject({ task: 'Write', rating: 4, parked: ['email'] })
  })

  it('imports v2 backups that predate boards and clears local boards', async () => {
    const target = freshDb()
    await target.boardColumns.add({ id: 'stale', questId: 'p', title: 'Stale', order: 0, ...newMeta() })
    await target.cards.add({ id: 'stale', questId: 'p', columnId: 'stale', title: 'Stale', order: 0, subtasks: [], ...newMeta() })
    const meta = newMeta()
    const v2 = {
      app: 'marble-jar',
      schemaVersion: 2,
      exportedAt: meta.createdAt,
      data: { quests: [{ id: 'q1', category: 'dq', title: 'Stretch', order: 0, startDate: '2026-11-01', ...meta }], settings: [DEFAULT_SETTINGS] },
    }
    await importBackup(parseBackup(JSON.stringify(v2)), target)
    expect(await target.quests.count()).toBe(1)
    expect(await target.boardColumns.count()).toBe(0)
    expect(await target.cards.count()).toBe(0)
  })

  it('imports v3 backups as claimed: completions on claimed days are marked, nothing re-awards', async () => {
    const meta = newMeta('2026-11-01T04:00:00.000Z')
    const comp = (id: string, dayKey: string) => ({ id, questId: 'q1', category: 'dq', dayKey, completedAt: meta.createdAt, ...meta })
    const v3 = {
      app: 'marble-jar',
      schemaVersion: 3,
      exportedAt: meta.createdAt,
      data: {
        quests: [{ id: 'q1', category: 'dq', title: 'Stretch', order: 0, startDate: '2026-11-01', ...meta }],
        questCompletions: [comp('q1:2026-11-01', '2026-11-01'), comp('q1:2026-11-02', '2026-11-02')],
        dayClaims: [{ dayKey: '2026-11-01', jarId: 'j1', claimedAt: '2026-11-01T12:00:00.000Z', weight: 1, ...meta }],
      },
    }
    const target = freshDb()
    await importBackup(parseBackup(JSON.stringify(v3)), target)
    expect(await target.questCompletions.get('q1:2026-11-01')).toMatchObject({ claimedAt: '2026-11-01T12:00:00.000Z', claimJarId: 'j1' })
    expect((await target.questCompletions.get('q1:2026-11-02'))?.claimedAt).toBeUndefined()
    const now = new Date(2026, 10, 2, 20)
    const r = await claimAll(target, now, () => 0.5)
    expect(r.days).toEqual(['2026-11-02'])
    expect((await claimAll(target, now, () => 0.5)).days).toEqual([])
  })

  it('round-trips notes', async () => {
    const source = freshDb()
    const meta = newMeta()
    await source.notes.add({ id: 'n1', title: 'Plan', body: 'Ship the board', pinned: true, questId: 'p1', ...meta })
    await source.notes.add({ id: 'n2', title: 'Gone', body: '', deletedAt: meta.createdAt, ...meta })

    const backup = parseBackup(JSON.stringify(await exportBackup(source)))
    expect(backup.data.notes).toHaveLength(2)
    const target = freshDb()
    await importBackup(backup, target)
    expect(await target.notes.get('n1')).toMatchObject({ title: 'Plan', pinned: true, questId: 'p1' })
    expect((await target.notes.get('n2'))?.deletedAt).toBe(meta.createdAt)
  })

  it('imports v4 backups that predate notes and clears local notes', async () => {
    const target = freshDb()
    await target.notes.add({ id: 'stale', title: 'Stale', body: '', ...newMeta() })
    const meta = newMeta()
    const v4 = {
      app: 'marble-jar',
      schemaVersion: 4,
      exportedAt: meta.createdAt,
      data: { quests: [{ id: 'q1', category: 'dq', title: 'Stretch', order: 0, startDate: '2026-11-01', ...meta }], settings: [DEFAULT_SETTINGS] },
    }
    await importBackup(parseBackup(JSON.stringify(v4)), target)
    expect(await target.quests.count()).toBe(1)
    expect(await target.notes.count()).toBe(0)
  })

  it('rejects files that are not Pebblework backups', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"marble-jar","schemaVersion":999,"data":{}}')).toThrow(/newer version/)
    expect(() => parseBackup('{"app":"marble-jar","schemaVersion":1,"data":{"goals":5}}')).toThrow(/malformed/)
  })
})

describe('backup reminder', () => {
  const now = new Date('2026-11-10T12:00:00Z')
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString()
  const daysAhead = (n: number) => daysAgo(-n)

  it('waits for two weeks of history, then asks until a backup is under a month old', () => {
    expect(backupDue(undefined, undefined, now)).toBe(false)
    expect(backupDue(undefined, daysAgo(13), now)).toBe(false)
    expect(backupDue(undefined, daysAgo(14), now)).toBe(true)
    expect(backupDue({ lastExportAt: daysAgo(29) }, daysAgo(90), now)).toBe(false)
    expect(backupDue({ lastExportAt: daysAgo(30) }, daysAgo(90), now)).toBe(true)
  })

  it('stays quiet while snoozed', () => {
    expect(backupDue({ backupSnoozedUntil: daysAhead(1) }, daysAgo(90), now)).toBe(false)
    expect(backupDue({ backupSnoozedUntil: daysAgo(1) }, daysAgo(90), now)).toBe(true)
  })

  it('snoozes for two weeks even before the settings row exists', async () => {
    const d = freshDb()
    await snoozeBackupReminder(now, d)
    expect((await d.settings.get('settings'))?.backupSnoozedUntil).toBe(daysAhead(14))
  })
})

describe('restoring a backup', () => {
  it('counts the restored file as the latest backup', async () => {
    const source = freshDb()
    await source.settings.put({ ...DEFAULT_SETTINGS, lastExportAt: '2026-01-01T00:00:00.000Z' })
    const backup = await exportBackup(source)
    const target = freshDb()
    await importBackup(parseBackup(JSON.stringify(backup)), target)
    expect((await target.settings.get('settings'))?.lastExportAt).toBe(backup.exportedAt)
  })
})
