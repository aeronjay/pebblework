import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, MarbleDB, newId, newMeta } from './db'
import { BackupError, exportBackup, importBackup, parseBackup } from './backup'

let n = 0
const dbs: MarbleDB[] = []
function freshDb() {
  const d = new MarbleDB(`test-${n++}`)
  dbs.push(d)
  return d
}

afterEach(async () => {
  await Promise.all(dbs.splice(0).map((d) => d.delete()))
})

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
    expect(await target.settings.get('settings')).toEqual(DEFAULT_SETTINGS)
  })

  it('rejects files that are not Marble Jar backups', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"other"}')).toThrow(BackupError)
    expect(() => parseBackup('{"app":"marble-jar","schemaVersion":999,"data":{}}')).toThrow(/newer version/)
    expect(() => parseBackup('{"app":"marble-jar","schemaVersion":1,"data":{"goals":5}}')).toThrow(/malformed/)
  })
})
