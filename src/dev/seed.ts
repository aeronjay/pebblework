// Dev fixtures for the Quest Home. /?seed=1 → jar ~60% full; /?seed=full → jar ~92% with enough ready days to overflow.
// History is produced by the real repo/claim functions with a backdated `now`, so every record obeys the rules.
import { db, DEFAULT_SETTINGS, getDeviceId, type MarbleDB } from '../db/db'
import { claimAll, getActiveQuestJar, sealedQuestJarCount } from '../features/quests/claim'
import { addDaysToKey, dayKey, parseDayKey } from '../features/quests/day'
import { completeQuest, createQuest, deleteQuest } from '../features/quests/repo'
import { addCard, addColumn, addSubtask, loadBoard, moveCard, toggleSubtask, updateCard } from '../features/board/repo'
import type { QuestInput } from '../features/quests/repo'
import { endSession, parkThought, rateSession, startSession } from '../features/focus/repo'
import type { FocusRating } from '../db/types'

export type SeedMode = 'demo' | 'full'

export interface SeedSummary {
  jarId: string
  weight: number
  capacity: number
  jarsFilled: number
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function seed(database: MarbleDB = db, mode: SeedMode = 'demo', now: Date = new Date()): Promise<SeedSummary> {
  const rng = mulberry32(42)
  const today = dayKey(now)
  const key = (offset: number) => addDaysToKey(today, offset)
  const at = (offset: number, hour: number) => {
    const d = parseDayKey(key(offset))
    d.setHours(hour, Math.floor(rng() * 50))
    return d
  }
  const create = (input: QuestInput, offset: number) => createQuest(input, at(offset, 8), database)
  const complete = async (ids: string[], offset: number) => {
    for (const id of ids) await completeQuest(id, offset === 0 ? now : at(offset, 9 + Math.floor(rng() * 12)), database)
  }

  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((t) => t.clear()))
    // A recent backup, so demo screens (and README captures) don't show the backup reminder.
    await database.settings.put({ ...DEFAULT_SETTINGS, lastExportAt: now.toISOString() })
  })

  // Phase A: an older routine that fills (and seals) the first quest jar, then gets retired.
  const retired = [
    await create({ category: 'dq', title: 'Cold shower' }, -38),
    await create({ category: 'dq', title: 'Evening journal' }, -38),
  ]
  const deskId = await create({ category: 'sq', title: 'Clean the desk' }, -38)
  let offset = -38
  // Claiming every evening means the sealing stone never overflows, so the next jar starts empty and sizes
  // itself from the current routine at its first claim.
  while ((await sealedQuestJarCount(database)) === 0 && offset < -21) {
    if (offset !== -33) await complete(retired, offset) // one closed day in old history
    if (offset === -30) await complete([deskId], offset)
    await claimAll(database, at(offset, 22), rng)
    offset++
  }
  for (const id of retired) await deleteQuest(id, at(offset, 7), database)

  // Phase B: the current routine.
  const dq = [
    await create({ category: 'dq', title: 'Morning pages' }, -12),
    await create({ category: 'dq', title: 'Stretch for 10 minutes' }, -12),
    await create({ category: 'dq', title: 'Read 20 pages' }, -12),
  ]
  const plants = await create({ category: 'sq', title: 'Repot the plants' }, -12)
  const dentist = await create({ category: 'sq', title: 'Dentist check-up', dueDate: key(-10), dueTime: '15:30' }, -12)
  await create({ category: 'mq', title: 'Renew passport', dueDate: key(-7), note: 'Bring two photos.' }, -12) // missed
  const outline = await create({ category: 'mq', title: 'Outline the conference talk' }, -12)
  await create({ category: 'mq', title: 'Finish chapter 3 draft', dueDate: key(0) }, -12)
  await create({ category: 'mq', title: 'Ship portfolio v2', dueDate: key(5) }, -12)
  await create({ category: 'mq', title: 'Plan the Q1 roadmap' }, -12)
  await create({ category: 'sq', title: 'Return library books', dueDate: key(2), dueTime: '18:00' }, -12)
  await create({ category: 'sq', title: 'Fix the bike light' }, -12)
  await create({ category: 'sq', title: 'Try the new ramen place', dueDate: key(9) }, -12)
  const grandma = await create({ category: 'sq', title: 'Call grandma' }, -12)
  await seedStarfall(database, key, at, now)
  await seedPortfolio(database, key, at)
  await seedFocus(database, at)

  // Closed = passed with nothing done (any finished quest makes a day claimable). Day -8 is partial: one DQ skipped.
  const skipped = new Set([-9, -7])
  for (let o = -12; o <= -1; o++) if (!skipped.has(o)) await complete(o === -8 ? dq.slice(0, 2) : dq, o)
  await complete([plants], -11)
  await complete([dentist], -10)
  await complete([outline], -5)
  // Claimed through day -4; days -3..-1 stay ready (unclaimed).
  await claimAll(database, at(-8, 21), rng)
  await claimAll(database, at(-4, 21), rng)

  // Today: ready (one DQ, an anytime SQ and a card done; the rest open).
  await complete([dq[0], grandma], 0)

  // Shape the active jar for the demo: set its fill, and exactly one golden stone.
  const jar = (await getActiveQuestJar(database))!
  const stones = await database.stones.where('jarId').equals(jar.id).sortBy('at')
  const weight = stones.reduce((n, s) => n + s.weight, 0)
  const capacity = Math.max(weight + 1, Math.round(weight / (mode === 'full' ? 0.92 : 0.6)))
  const stamp = { updatedAt: now.toISOString(), deviceId: getDeviceId() }
  await database.transaction('rw', database.jars, database.stones, async () => {
    await database.jars.update(jar.id, { capacity, ...stamp })
    await Promise.all(
      stones.map((s, i) => database.stones.update(s.id, { rarity: i === Math.floor(stones.length / 2) ? 'golden' : 'normal', ...stamp })),
    )
  })

  return { jarId: jar.id, weight, capacity, jarsFilled: await sealedQuestJarCount(database) }
}

type At = (offset: number, hour: number) => Date

// A week of focus sessions (none today): varied lengths and ratings, a few parked thoughts.
async function seedFocus(database: MarbleDB, at: At) {
  const sessions: [offset: number, hour: number, task: string, planned: number, minutes: number, rating?: FocusRating, parked?: string[]][] = [
    [-6, 9, 'Finish chapter 3 draft', 45, 52, 5],
    [-6, 15, 'Plan the Q1 roadmap', 25, 25, 3, ['book flights']],
    [-5, 10, 'Outline the conference talk', 25, 31, 4],
    [-4, 14, 'Design the homepage', 45, 38, 2, ['reply to Mia', 'renew domain']],
    [-3, 9, 'Add login/logout', 25, 40, 4],
    [-2, 11, 'Finish chapter 3 draft', 15, 22, 4, ['look up citation style']],
    [-1, 9, 'Enemy AI', 45, 47, 5],
    [-1, 16, 'Write three case studies', 25, 18, 3],
  ]
  for (const [offset, hour, task, planned, minutes, rating, parked] of sessions) {
    const start = at(offset, hour)
    const id = await startSession({ task, plannedMin: planned }, start, database)
    for (const p of parked ?? []) await parkThought(id, p, start, database)
    const end = new Date(start.getTime() + minutes * 60_000)
    await endSession(id, end, database)
    if (rating) await rateSession(id, rating, end, database)
  }
}

// SQ project: To do / In progress / Playtest / Done, 9 cards; 2 finished on earlier (claimable/claimed) days, 1 today.
async function seedStarfall(database: MarbleDB, key: (o: number) => string, at: At, now: Date) {
  const t0 = at(-12, 8)
  const id = await createQuest({ category: 'sq', title: 'Making a Game: Starfall', note: 'A tiny space shooter.', isProject: true }, t0, database)
  await addColumn(id, 'Playtest', undefined, t0, database)
  const board = (await loadBoard(id, database))!
  const [todo, doing, playtest, done] = board.columns.map((c) => c.id)
  const card = (column: string, title: string) => addCard(id, column, title, t0, database)
  await card(todo, 'Save system')
  await card(todo, 'Sound design pass')
  const settings = await card(todo, 'Settings menu')
  await updateCard(settings, { dueDate: key(3), note: 'Volume, controls, accessibility.' }, t0, database)
  const login = await card(doing, 'Add login/logout')
  const subs = []
  for (const title of ['Login form', 'Session handling', 'Logout button', 'Error states']) subs.push(await addSubtask(login, title, t0, database))
  for (const s of subs.slice(0, 2)) await toggleSubtask(login, s, true, at(-3, 19), database)
  await card(doing, 'Enemy AI')
  await card(playtest, 'Level 1 layout')
  const movement = await card(todo, 'Player movement')
  const title = await card(todo, 'Title screen')
  const menu = await card(playtest, 'Main menu')
  // Day -6 gets claimed; day -2 stays ready; today is ready too.
  await moveCard(movement, done, 0, at(-6, 20), database)
  await moveCard(title, done, 0, at(-2, 20), database)
  await moveCard(menu, done, 0, now, database)
  return id
}

// MQ project on the default 3 columns.
async function seedPortfolio(database: MarbleDB, key: (o: number) => string, at: At) {
  const t0 = at(-12, 8)
  const id = await createQuest({ category: 'mq', title: 'Launch portfolio site', dueDate: key(20), isProject: true }, t0, database)
  const [todo, doing] = (await loadBoard(id, database))!.columns.map((c) => c.id)
  await addCard(id, todo, 'Pick a domain', t0, database)
  await addCard(id, todo, 'Write three case studies', t0, database)
  await addCard(id, doing, 'Design the homepage', t0, database)
  return id
}

// Returns true when it seeded and is reloading the page.
export async function seedFromUrl(): Promise<boolean> {
  const value = new URLSearchParams(location.search).get('seed')
  if (value === null) return false
  const summary = await seed(db, value === 'full' ? 'full' : 'demo')
  console.info('[seed]', summary)
  history.replaceState(null, '', location.pathname + location.hash)
  location.reload()
  return true
}
