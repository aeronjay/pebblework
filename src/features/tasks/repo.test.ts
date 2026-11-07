import { describe, expect, it } from 'vitest'
import { freshDb } from '../../test/db'
import { createTask, deleteTask, listTasks, reorderLooseEnds, toggleTask, updateTask } from './repo'

const now = new Date('2026-11-06T12:00:00.000Z')

describe('tasks repo', () => {
  it('awards one quest-jar stone on the first completion only', async () => {
    const d = freshDb()
    const id = await createTask({ title: 'Film the Loom video' }, now, d)

    expect(await toggleTask(id, now, d)).toBe(true)
    expect(await d.stones.count()).toBe(1)
    expect((await d.stones.toArray())[0]).toMatchObject({ category: 'sq', weight: 1, dayKey: '2026-11-06' })

    expect(await toggleTask(id, now, d)).toBe(false)
    expect(await toggleTask(id, now, d)).toBe(true)
    expect(await d.stones.count()).toBe(1)
  })

  it('keeps overdue loose ends ahead of future and undated ones', async () => {
    const d = freshDb()
    await createTask({ title: 'Later', dueDate: '2026-11-10' }, now, d)
    await createTask({ title: 'Overdue', dueDate: '2026-11-05' }, now, d)
    await createTask({ title: 'No deadline' }, now, d)

    expect((await listTasks(d, now)).map((task) => task.title)).toEqual(['Overdue', 'Later', 'No deadline'])
    await updateTask((await d.tasks.filter((task) => task.title === 'No deadline').first())!.id, { dueDate: '2026-11-07' }, now, d)
    expect((await listTasks(d, now)).map((task) => task.title)).toEqual(['Overdue', 'No deadline', 'Later'])
  })

  it('keeps the arranged order over deadlines, with new loose ends on top and finished ones last', async () => {
    const d = freshDb()
    const later = await createTask({ title: 'Later', dueDate: '2026-11-10' }, now, d)
    const overdue = await createTask({ title: 'Overdue', dueDate: '2026-11-05' }, now, d)
    const undated = await createTask({ title: 'No deadline' }, now, d)
    const titles = async () => (await listTasks(d, now)).map((task) => task.title)

    await reorderLooseEnds([undated, later, overdue], d)
    expect(await titles()).toEqual(['No deadline', 'Later', 'Overdue'])

    await createTask({ title: 'Just added' }, now, d)
    expect(await titles()).toEqual(['Just added', 'No deadline', 'Later', 'Overdue'])

    await toggleTask(undated, now, d)
    expect(await titles()).toEqual(['Just added', 'Later', 'Overdue', 'No deadline'])
  })

  it('ignores deleted tasks left in the saved order', async () => {
    const d = freshDb()
    const a = await createTask({ title: 'A' }, now, d)
    const b = await createTask({ title: 'B' }, now, d)
    await reorderLooseEnds([b, a], d)
    await deleteTask(b, now, d)
    expect((await listTasks(d, now)).map((task) => task.title)).toEqual(['A'])
  })
})
