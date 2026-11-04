import { describe, expect, it } from 'vitest'
import { arrayMove, backTarget, containerOf, describeDue, moveItem, moveMessage, projectMessage } from './model'

describe('board model', () => {
  const items = { a: ['1', '2', '3'], b: ['4'] }

  it('finds containers by column or card id', () => {
    expect(containerOf(items, 'a')).toBe('a')
    expect(containerOf(items, '4')).toBe('b')
    expect(containerOf(items, 'x')).toBeUndefined()
  })

  it('moves a card across columns at a clamped index without mutating', () => {
    expect(moveItem(items, '2', 'b', 0)).toEqual({ a: ['1', '3'], b: ['2', '4'] })
    expect(moveItem(items, '2', 'b', 99)).toEqual({ a: ['1', '3'], b: ['4', '2'] })
    expect(items.a).toEqual(['1', '2', '3'])
  })

  it('arrayMove uses final-index semantics', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
  })

  it('describes due reminders relative to today', () => {
    expect(describeDue('2026-11-01', '2026-11-01')).toMatchObject({ label: 'Due today', tone: 'soon' })
    expect(describeDue('2026-11-02', '2026-11-01').label).toBe('Due tomorrow')
    expect(describeDue('2026-11-04', '2026-11-01')).toMatchObject({ label: 'Due Wed', tone: 'later' })
    expect(describeDue('2026-10-20', '2026-11-01')).toMatchObject({ label: 'Was due Oct 20', tone: 'overdue' })
  })

  it('words move results', () => {
    expect(moveMessage({ awarded: true, withdrawn: false, todayClaimed: false }, true)).toMatch(/\+1 stone/)
    expect(moveMessage({ awarded: false, withdrawn: false, todayClaimed: true }, true)).toMatch(/already earned/)
    expect(moveMessage({ awarded: false, withdrawn: true, todayClaimed: false }, false)).toMatch(/returned/)
    expect(moveMessage({ awarded: false, withdrawn: false, todayClaimed: false }, false)).toBeNull()
    expect(projectMessage(true)).toMatch(/\+3 stones/)
    // Open quests never block a claim.
    expect(moveMessage({ awarded: true, withdrawn: false, todayClaimed: false }, true, 0)).toMatch(/claim it on the calendar/)
    expect(moveMessage({ awarded: true, withdrawn: false, todayClaimed: false }, true, 2)).toMatch(/claim it on the calendar/)
    expect(projectMessage(true, 1)).toMatch(/claim them on the calendar/)
  })
})

describe('backTarget', () => {
  it('names the in-app page it returns to, and falls back to Projects', () => {
    expect(backTarget('#/notes')).toEqual({ label: 'Notes', to: '#/notes', inApp: true })
    expect(backTarget('#/')).toEqual({ label: 'Home', to: '#/', inApp: true })
    expect(backTarget('#/projects')).toEqual({ label: 'Projects', to: '#/projects', inApp: true })
    expect(backTarget(null)).toEqual({ label: 'Projects', to: '#/projects', inApp: false })
    expect(backTarget('#/quests/abc')).toEqual({ label: 'Projects', to: '#/projects', inApp: false })
  })
})
