// The shelf: every quest jar you've filled, as a record of what you've done. Sealed jars keep their stones (jarId), so
// each jar is redrawn from them; no physics snapshot is needed.
import { format } from 'date-fns'
import { db, touch, type MarbleDB } from '../../db/db'
import type { Jar, QuestCategory, Rarity, Stone } from '../../db/types'
import { CATEGORY_ORDER, isoToDayKey, parseDayKey } from '../quests/day'
import { hashString, seeded } from '../jar/sim'

export interface ShelfJar {
  jar: Jar
  number: number // 1 = the first jar ever filled
  name: string // the label, else "Jar N"
  stones: Stone[] // drop order
  weight: number
  byCategory: Record<QuestCategory, number> // stone weight per category
  rare: number // golden + mythic stones
  filledOn?: string // dayKey the jar sealed; undefined for the jar still filling
  firstDay?: string // earliest stone dayKey (the work, not the claim)
  lastDay?: string
}

export interface Shelf {
  filled: ShelfJar[] // oldest first
  current: ShelfJar | null // the jar filling now, when it has stones
}

const byDrop = (a: Stone, b: Stone) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)

export function jarName(jar: Pick<Jar, 'label'>, number: number): string {
  return jar.label?.trim() || `Jar ${number}`
}

export function summarizeJar(jar: Jar, stones: Stone[], number: number): ShelfJar {
  const live = stones.filter((s) => !s.deletedAt && s.jarId === jar.id).sort(byDrop)
  const byCategory = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as Record<QuestCategory, number>
  let weight = 0
  let rare = 0
  let firstDay: string | undefined
  let lastDay: string | undefined
  for (const s of live) {
    weight += s.weight
    byCategory[s.category] += s.weight
    if (s.rarity !== 'normal') rare++
    if (!firstDay || s.dayKey < firstDay) firstDay = s.dayKey
    if (!lastDay || s.dayKey > lastDay) lastDay = s.dayKey
  }
  return {
    jar,
    number,
    name: jarName(jar, number),
    stones: live,
    weight,
    byCategory,
    rare,
    filledOn: jar.sealedAt ? isoToDayKey(jar.sealedAt) : undefined,
    firstDay,
    lastDay,
  }
}

// Pure: sealed quest jars oldest first (numbered from 1), and the open one if it already holds stones.
export function buildShelf(jars: Jar[], stones: Stone[]): Shelf {
  const quest = jars.filter((j) => j.kind === 'quest' && !j.deletedAt)
  const sealed = quest.filter((j) => j.sealedAt).sort((a, b) => a.sealedAt!.localeCompare(b.sealedAt!) || a.id.localeCompare(b.id))
  const open = quest.filter((j) => !j.sealedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0]
  const byJar = new Map<string, Stone[]>()
  for (const s of stones) byJar.set(s.jarId, [...(byJar.get(s.jarId) ?? []), s])
  const filled = sealed.map((j, i) => summarizeJar(j, byJar.get(j.id) ?? [], i + 1))
  const current = open ? summarizeJar(open, byJar.get(open.id) ?? [], sealed.length + 1) : null
  return { filled, current: current && current.stones.length ? current : null }
}

export async function loadShelf(database: MarbleDB = db): Promise<Shelf> {
  const jars = await database.jars.where('kind').equals('quest').toArray()
  const ids = jars.filter((j) => !j.deletedAt).map((j) => j.id)
  const stones = ids.length ? await database.stones.where('jarId').anyOf(ids).filter((s) => !s.deletedAt).toArray() : []
  return buildShelf(jars, stones)
}

// Blank clears the label (back to "Jar N").
export async function renameJar(id: string, label: string, now: Date = new Date(), database: MarbleDB = db): Promise<void> {
  await database.transaction('rw', database.jars, async () => {
    const jar = await database.jars.get(id)
    if (!jar || jar.deletedAt) return
    const next = touch(jar, now.toISOString())
    const clean = label.trim().slice(0, 60)
    if ((jar.label ?? '') === clean) return
    if (clean) next.label = clean
    else delete next.label
    await database.jars.put(next)
  })
}

// "Oct 12 – Nov 3, 2026": the span of days whose work is in the jar.
export function spanLabel(first: string | undefined, last: string | undefined): string {
  if (!first || !last) return ''
  const a = parseDayKey(first)
  const b = parseDayKey(last)
  if (first === last) return format(a, 'MMM d, yyyy')
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'MMM d, yyyy')} – ${format(b, 'MMM d, yyyy')}`
  return `${format(a, 'MMM d')} – ${format(b, 'MMM d, yyyy')}`
}

export interface PlacedPebble {
  id: string
  category: QuestCategory
  rarity: Rarity
  x: number
  y: number
  rx: number
  ry: number
  rotate: number // degrees
}

// Lays stones in rows from the bottom of a w×h interior, in drop order, sized by weight so a full jar looks full.
// Deterministic (seeded by stone id), so a jar looks the same every visit.
export function layoutPebbles(stones: Pick<Stone, 'id' | 'category' | 'rarity' | 'weight'>[], capacity: number, w: number, h: number): PlacedPebble[] {
  // Row packing is looser than the physics pile, so stones get less of the interior to still fit when full.
  const unitArea = (w * h * 0.6) / Math.max(1, capacity)
  const out: PlacedPebble[] = []
  let row: PlacedPebble[] = []
  let x = 0
  let floor = h // bottom of the current row
  let rowH = 0

  const closeRow = () => {
    if (!row.length) return
    // Centre the row and let it settle on the row below.
    const used = x
    const shift = (w - used) / 2
    for (const p of row) {
      p.x += shift
      p.y = floor - p.ry
    }
    out.push(...row)
    floor -= rowH * 0.86
    row = []
    x = 0
    rowH = 0
  }

  for (const s of stones) {
    const rand = seeded(hashString(s.id))
    const r = Math.sqrt((unitArea * s.weight) / Math.PI)
    const rx = r * (1.08 + rand() * 0.18)
    const ry = r * (0.78 + rand() * 0.12)
    if (x + rx * 2 > w && row.length) closeRow()
    row.push({ id: s.id, category: s.category, rarity: s.rarity, x: x + rx, y: 0, rx, ry, rotate: (rand() - 0.5) * 34 })
    x += rx * 2 - r * 0.12
    rowH = Math.max(rowH, ry * 2)
  }
  closeRow()
  return out
}
