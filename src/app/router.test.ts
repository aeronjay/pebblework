import { describe, expect, it } from 'vitest'
import { href, parseHash } from './router'

describe('parseHash', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    ['#/today', { name: 'today' }],
    ['#/goals', { name: 'goals' }],
    ['#/goals/new', { name: 'newGoal' }],
    ['#/goals/abc', { name: 'goal', id: 'abc' }],
    ['#/goals/abc/edit', { name: 'editGoal', id: 'abc' }],
    ['#/settings', { name: 'settings' }],
    ['#/projects', { name: 'projects' }],
    ['#/quests/abc', { name: 'board', id: 'abc' }],
    ['#/quests', { name: 'home' }],
    ['#/nope', { name: 'home' }],
  ])('%s', (hash, route) => expect(parseHash(hash)).toEqual(route))

  it('round-trips the project hrefs', () => {
    expect(parseHash(href.projects)).toEqual({ name: 'projects' })
    expect(parseHash(href.board('q-1'))).toEqual({ name: 'board', id: 'q-1' })
  })
})
