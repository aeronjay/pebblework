import 'fake-indexeddb/auto'
import { afterEach } from 'vitest'
import { MarbleDB } from '../db/db'

let n = 0
const open: MarbleDB[] = []

export function freshDb(): MarbleDB {
  const d = new MarbleDB(`test-${n++}`)
  open.push(d)
  return d
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((d) => d.delete()))
})
