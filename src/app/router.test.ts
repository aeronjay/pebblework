import { describe, expect, it } from 'vitest'
import { href, parseHash } from './router'

describe('parseHash', () => {
  it.each([
    ['', { name: 'home' }],
    ['#/', { name: 'home' }],
    // Removed tabs: old links land on Home.
    ['#/today', { name: 'home' }],
    ['#/goals', { name: 'home' }],
    ['#/goals/abc/edit', { name: 'home' }],
    ['#/settings', { name: 'settings' }],
    ['#/projects', { name: 'projects' }],
    ['#/notes', { name: 'notes' }],
    ['#/quests/abc', { name: 'board', id: 'abc' }],
    ['#/quests', { name: 'home' }],
    ['#/nope', { name: 'home' }],
  ])('%s', (hash, route) => expect(parseHash(hash)).toEqual(route))

  it('round-trips the project hrefs', () => {
    expect(parseHash(href.projects)).toEqual({ name: 'projects' })
    expect(parseHash(href.board('q-1'))).toEqual({ name: 'board', id: 'q-1' })
  })
})
