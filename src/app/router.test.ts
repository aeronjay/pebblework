import { describe, expect, it } from 'vitest'
import { parseHash } from './router'

describe('parseHash', () => {
  it.each([
    ['', { name: 'today' }],
    ['#/', { name: 'today' }],
    ['#/goals', { name: 'goals' }],
    ['#/goals/new', { name: 'newGoal' }],
    ['#/goals/abc', { name: 'goal', id: 'abc' }],
    ['#/goals/abc/edit', { name: 'editGoal', id: 'abc' }],
    ['#/settings', { name: 'settings' }],
    ['#/nope', { name: 'today' }],
  ])('%s', (hash, route) => expect(parseHash(hash)).toEqual(route))
})
