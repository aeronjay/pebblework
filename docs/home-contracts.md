# Quest Home — Build Contracts

Shared source of truth for every agent working on the Quest Home tab. Product spec: `docs/home-spec.md`.
Read both files fully before writing code. If you must deviate from a contract, write the change into the
"Changelog" section at the bottom so other agents see it.

Stack: Vite + React 19 + TypeScript, Tailwind v4 (`@theme` in `src/index.css`), Dexie (IndexedDB) +
`dexie-react-hooks`, date-fns, matter-js, vitest + fake-indexeddb (`src/test/db.ts`). Match existing code style:
small files, terse comments only where the "why" isn't obvious, no semicolons, single quotes, 2-space indent.

## 1. Product decisions (already made — do not relitigate)

- **Home is a new landing tab** at route `#/` (`{ name: 'home' }`). The existing Today screen moves to `#/today`.
  Goals/Today/Settings keep working. Quests are a **new model alongside Goals**; do not remove goals.
- **Two jar kinds.** `Jar.kind?: 'goal' | 'quest'` (`undefined` = `'goal'` for old data). Every
  `getActiveJar`/`ensureActiveJar` call filters by kind, so goal check-ins never land in the quest jar and vice versa.
  The quest jar is fed **only** by claims.
- **Day keys** are local `yyyy-MM-dd` strings from `date-fns` `format(date, 'yyyy-MM-dd')`. Never
  `toISOString().slice(0, 10)` (breaks at UTC+8). Every rule function takes an injectable `now: Date`.
- **Assignment rule** (which quests belong to day `d`):
  - **DQ** is a template: assigned to `d` when `startDate <= d` and the quest was not deleted on/before `d`
    (`deletedAt` local day key `> d`, or no `deletedAt`).
  - **MQ/SQ with `dueDate`**: assigned to `d === dueDate` (same deletion rule).
  - **MQ/SQ undated**: never assigned to any day (never blocks a day). When completed, the completion counts toward
    its completion day's intensity/stones.
- **Same-day completion lock.** `canComplete(quest, now)` is true only if: DQ assigned today; or MQ/SQ due today; or
  MQ/SQ undated and not yet completed. Future-dated or past-dated quests cannot be completed. Uncomplete is allowed
  only on the same day **and** only if that day is not already claimed.
- **Missed quests are immutable.** A dated MQ/SQ whose `dueDate` is in the past cannot have its date edited (that
  would retro-unblock a past day). Instead the UI offers "Do it today" → creates a copy due today.
  Deleting a quest only removes it from days **on/after** the deletion day; past days keep it.
- **Day status** (`DayStatus`):
  - `future` — after today (may still show scheduled count).
  - `empty` — today or past, no assigned quests and no completions.
  - `pending` — today, has work not yet all done.
  - `ready` — all assigned quests done and ≥1 completion, not yet claimed. (Today can be ready.)
  - `claimed` — a `DayClaim` exists. Claims are final; quests added to a claimed day don't reopen it.
  - `closed` — past, not all done. Neutral look (muted, never red, no guilt copy).
- **Intensity** (GitHub-style), from completions that day: `0→0, 1→1, 2–3→2, 4–5→3, 6+→4`.
- **Stones.** Per day, one group per category that has completions; each category's count `n` is split into stones
  of weight ≤ 3 (e.g. 5 → [3, 2]). Weight drives stone size. Jar fill = Σ weight / capacity (not a count).
- **Claim is idempotent.** One global button. `claimAll(db, now)` runs in a single Dexie `rw` transaction, skips any
  day that already has a `DayClaim`, and returns what it awarded. Double clicks / two tabs must not double-award.
- **Dynamic capacity.** Quest jar capacity (in weight units) is recomputed from quest load **until the first stone
  lands**, then frozen for that jar:
  `capacity = clamp(activeDQ * 14 + (MQ/SQ due in next 14 days) + openUndatedMQSQ, 21, 150)`.
- **Full jar.** When a claim pushes Σweight ≥ capacity: set `sealedAt` on that quest jar, start a new quest jar, and
  move overflow stones (those that didn't fit, in drop order) into the new jar. **"Jars filled"** = count of sealed
  quest jars (derived, no separate counter).
- **Rarity:** each stone rolls rarity with the existing `rollRarity` (golden/mythic look special, same weight).

## 2. Data layer (Phase 1 owns; others consume)

`src/db/types.ts` additions:

```ts
export type QuestCategory = 'dq' | 'mq' | 'sq'

export interface Quest extends Meta {
  id: string
  category: QuestCategory
  title: string
  order: number
  startDate: string        // dayKey; DQ active from this day. For MQ/SQ = creation day.
  dueDate?: string         // dayKey; MQ/SQ only
  dueTime?: string         // "HH:mm", optional, display only
  note?: string
}

export interface QuestCompletion extends Meta {
  id: string               // `${questId}:${dayKey}`
  questId: string
  category: QuestCategory  // denormalized so stones survive quest deletion
  dayKey: string
  completedAt: string      // ISO
}

export interface DayClaim extends Meta {
  dayKey: string           // primary key
  jarId: string
  claimedAt: string
  weight: number
}

export interface Stone extends Meta {
  id: string
  jarId: string
  dayKey: string
  category: QuestCategory
  weight: 1 | 2 | 3
  rarity: Rarity
  at: string               // ISO claim time; order = (at, id)
}
```

`Jar` gains `kind?: 'goal' | 'quest'`. Dexie `version(2)` adds tables `quests`, `questCompletions`, `dayClaims`,
`stones` (keep `version(1)` intact). Backup export/import includes the new tables.

> **Superseded by §2a below** (the final, implemented signatures). The table is the original plan; where they differ, §2a wins.

Module `src/features/quests/` (Phase 1 writes all of these + tests):

| File | Exports |
|---|---|
| `day.ts` (pure) | `dayKey(d: Date)`, `isAssigned(q, dayKey)`, `canComplete(q, completions, now)`, `dayStatus(...)`, `intensity(n)`, `stonesForDay(completions)`, `jarCapacityFor(quests, now)` |
| `repo.ts` | `createQuest(input)`, `updateQuest(id, patch)`, `deleteQuest(id)`, `doItToday(id)`, `completeQuest(id, now?)`, `uncompleteQuest(id, now?)` — all take optional `database` last, like `features/goals/repo.ts` |
| `claim.ts` | `claimAll(database, now?) : Promise<ClaimResult>`; `getActiveQuestJar`, `ensureActiveQuestJar` |
| `hooks.ts` | `useQuests()`, `useCompletions(fromKey, toKey)`, `useMonth(month: Date) : MonthDay[]`, `useClaimable(): { days: string[]; weight: number }`, `useQuestJar(): { jar, stones, capacity, fill, jarsFilled } \| undefined` |
| `claimBus.ts` | tiny emitter: `emitClaim(e: ClaimEvent)`, `onClaim(cb) => unsubscribe` |
| `meta.ts` | `CATEGORY: Record<QuestCategory, { short: 'DQ'\|'MQ'\|'SQ'; label: string; blurb: string; Icon: LucideIcon; color: string /* css var() */; soft: string; ink: string }>` and `CATEGORY_ORDER` |

```ts
export interface MonthDay { key: string; date: Date; inMonth: boolean; isToday: boolean
  status: DayStatus; assigned: number; done: number; intensity: 0|1|2|3|4; categories: QuestCategory[] }

export interface ClaimResult { days: string[]; stones: Stone[]; filledJarIds: string[] /* sealed this claim */ }

export interface ClaimEvent { result: ClaimResult; origins: Record<string, DOMRect> /* dayKey → cell rect */ }
```

### 2a. Final API (Phase 1, implemented — code against this)

`Quest` also has `redoneAs?: string` (set when "Do it today" copied a missed quest). `Jar.kind?: JarKind` (`'goal' | 'quest'`).
Dexie v2 indexes: `jars: 'id, kind, startedAt, sealedAt, updatedAt'`, `quests: 'id, category, dueDate, updatedAt'`,
`questCompletions: 'id, questId, dayKey, updatedAt'`, `dayClaims: 'dayKey, jarId, updatedAt'`, `stones: 'id, jarId, dayKey, at, updatedAt'`.
Backup schema version is 2; v1 files still import.

**`day.ts`** (pure; never reads the clock)

```ts
type DayStatus = 'future' | 'empty' | 'pending' | 'ready' | 'claimed' | 'closed'
type Intensity = 0 | 1 | 2 | 3 | 4
type StoneWeight = 1 | 2 | 3
type QuestWhen = 'today' | 'upcoming' | 'anytime' | 'missed' | 'past'
interface StoneSpec { category: QuestCategory; weight: StoneWeight }
interface DaySummary { status: DayStatus; assigned: number; done: number; intensity: Intensity; categories: QuestCategory[] }
interface MonthDay extends DaySummary { key: string; date: Date; inMonth: boolean; isToday: boolean }
const CATEGORY_ORDER: QuestCategory[]            // ['dq', 'mq', 'sq']
const MAX_STONE_WEIGHT = 3, CAPACITY_MIN = 21, CAPACITY_MAX = 150, CAPACITY_WINDOW_DAYS = 14, DQ_CAPACITY_DAYS = 14

dayKey(d: Date): string                          // local 'yyyy-MM-dd'
parseDayKey(key: string): Date                   // local midnight
addDaysToKey(key: string, n: number): string
isoToDayKey(iso: string): string
completionId(questId: string, key: string): string
isUndated(q: Quest): boolean                     // MQ/SQ without dueDate
isAssigned(q: Quest, key: string): boolean
isQuestDone(q: Quest, completions: QuestCompletion[], now: Date): boolean   // DQ: today; MQ/SQ: ever
canComplete(q: Quest, completions: QuestCompletion[], now: Date): boolean
canUncomplete(q: Quest, completions: QuestCompletion[], todayClaimed: boolean, now: Date): boolean
isMissed(q: Quest, completions: QuestCompletion[], now: Date): boolean
questWhen(q: Quest, completions: QuestCompletion[], now: Date): QuestWhen
dayStatus(key: string, quests: Quest[], completions: QuestCompletion[], claimed: boolean, now: Date): DayStatus
daySummary(key: string, quests: Quest[], completions: QuestCompletion[], claimed: boolean, now: Date): DaySummary
claimableDays(quests: Quest[], completions: QuestCompletion[], claimed: ReadonlySet<string>, now: Date): string[]
intensity(n: number): Intensity
stonesForDay(completions: QuestCompletion[]): StoneSpec[]   // pass one day's completions
jarCapacityFor(quests: Quest[], now: Date, completions?: QuestCompletion[]): number
monthGrid(month: Date, weekStartsOn?: 0 | 1): Date[]
monthDays(month: Date, quests: Quest[], completions: QuestCompletion[], claimed: ReadonlySet<string>, now: Date, weekStartsOn?: 0 | 1): MonthDay[]
```

Pass **all** quests (including soft-deleted) to `dayStatus`/`daySummary`/`claimableDays`/`monthDays`: deleted quests still
count on days before their deletion day. `MonthDay.assigned` = quests assigned that day ∪ quests completed that day;
`done` = completions that day (= stone weight units); `categories` = categories assigned or completed, in order.

**`repo.ts`** — `now` defaults to `new Date()`, `database` to the app db. Rule violations throw `QuestError` (message is
user-presentable); complete/uncomplete return `false` instead of throwing.

```ts
class QuestError extends Error {}
interface QuestInput { category: QuestCategory; title: string; dueDate?: string; dueTime?: string; note?: string; startDate?: string /* DQ only */ }
interface QuestPatch { title?: string; note?: string | null; dueTime?: string | null; dueDate?: string | null; order?: number } // null clears

createQuest(input: QuestInput, now?: Date, database?: MarbleDB): Promise<string>        // returns id
updateQuest(id: string, patch: QuestPatch, now?: Date, database?: MarbleDB): Promise<void>
deleteQuest(id: string, now?: Date, database?: MarbleDB): Promise<void>
doItToday(id: string, now?: Date, database?: MarbleDB): Promise<string>                 // returns the copy's id
completeQuest(id: string, now?: Date, database?: MarbleDB): Promise<boolean>
uncompleteQuest(id: string, now?: Date, database?: MarbleDB): Promise<boolean>
moveQuest(id: string, direction: -1 | 1, now?: Date, database?: MarbleDB): Promise<void> // reorder within category
sortQuests(list: Quest[]): Quest[]
liveQuests(database?): Promise<Quest[]>          // non-deleted, sorted
allQuests(database?): Promise<Quest[]>           // including deleted
completionsBetween(fromKey: string, toKey: string, database?): Promise<QuestCompletion[]>
liveCompletions(database?): Promise<QuestCompletion[]>
claimedKeys(database?): Promise<Set<string>>
```

**`claim.ts`**

```ts
interface ClaimResult { days: string[]; stones: Stone[] /* drop order */; filledJarIds: string[] }
claimAll(database?: MarbleDB, now?: Date, rng?: Rng): Promise<ClaimResult>
getActiveQuestJar(database?: MarbleDB): Promise<Jar | undefined>
ensureActiveQuestJar(database?: MarbleDB, now?: Date): Promise<Jar>
sealedQuestJarCount(database?: MarbleDB): Promise<number>
```

UI usage: `const result = await claimAll()` (no args). Stones in `result.stones` are in drop order; each has `jarId`, so
the jar can tell which stones landed in a sealed jar (`filledJarIds`) and which overflowed into the new one.

**`hooks.ts`** (all read-only; day rolls over via `useToday`)

```ts
useQuests(): Quest[] | undefined
useCompletions(fromKey: string, toKey: string): QuestCompletion[]          // [] while loading
useMonth(month: Date, weekStartsOn?: 0 | 1): MonthDay[]                     // [] while loading; full weeks
useClaimable(): { days: string[]; weight: number }                          // empty while loading
useQuestJar(): QuestJarState | undefined                                     // undefined = loading
useQuestToday(): QuestToday | undefined                                      // undefined = loading

interface QuestJarState { jar: Jar | null /* null before the first claim */; stones: Stone[]; weight: number
  capacity: number /* frozen once jar has stones, else live from quest load */; fill: number /* 0..1 */; jarsFilled: number }
interface QuestItem { quest: Quest; when: QuestWhen; done: boolean; doneToday: boolean
  canComplete: boolean; canUncomplete: boolean; missed: boolean /* offer "Do it today" if missed && !quest.redoneAs */ }
interface QuestToday extends DaySummary { todayKey: string; claimed: boolean; items: QuestItem[] /* every live quest */ }
```

**`claimBus.ts`**: `interface ClaimEvent { result: ClaimResult; origins: Record<string, DOMRect> }`,
`emitClaim(e: ClaimEvent): void`, `onClaim(cb: (e: ClaimEvent) => void): () => void`.

**`meta.ts`**: `CATEGORY: Record<QuestCategory, CategoryMeta>` with
`{ short, label, blurb, Icon: LucideIcon, color: 'var(--color-dq)', soft: 'var(--color-dq-soft)', ink: 'var(--color-dq-ink)' }`,
re-exports `CATEGORY_ORDER`, and `resolveCategoryColor(category, which?: 'color' | 'soft' | 'ink', el?): string` for canvas
(computed value of the token, theme-aware at call time).

**Tokens / Tailwind classes** (`@theme static` in `src/index.css`; dark values swap under `prefers-color-scheme: dark`, so
no `dark:` variant is needed with these):
- Surfaces: `bg-canvas`, `bg-surface`, `bg-elevated`, `bg-sunken`; borders `border-line`, `border-line-strong`
  (also `divide-line`); text `text-ink`, `text-muted`, `text-faint`; focus `ring-ring`, `outline-ring`.
- Categories: `{bg,text,border,ring,fill,stroke}-{dq,mq,sq}`, `bg-{dq,mq,sq}-soft`, `text-{dq,mq,sq}-ink`. CSS vars
  `--color-dq`, `--color-dq-soft`, `--color-dq-ink` etc.
- Radii: `rounded-card` (20px), `rounded-control` (12px), `rounded-chip` (999px).
- Shadows: `shadow-card`, `shadow-pop` (dark versions include the inset top highlight).
- Fonts: `font-sans` (Inter Variable, cv11/ss01, default on body), `font-display` (Fraunces Variable, opsz axis). Use
  Tailwind's `tabular-nums` for counts. Easing: `ease-out-soft`.
- `src/ui/styles.ts` keeps its keys (`ui.input/label/hint/btn/primary/secondary/danger/card/h1`, `seg`, `segGroup`), now on tokens.

**Dev seed**: `npm run dev`, open `http://localhost:5173/?seed=1#/` (or `?seed=full#/`). It wipes the DB, seeds, strips
the param (keeps the hash) and reloads. `seed(database, mode, now)` in `src/dev/seed.ts` is also callable from tests.

**Claim → jar choreography.** The calendar calls `claimAll`, then `emitClaim({ result, origins })` with the bounding
rects of the claimed cells. The jar listens with `onClaim`: it may fly tokens from `origins` to the jar mouth, then
drop the stones physically. Because the DB may already show a **new** active jar after a fill, the jar component must
play from the event (drop → fill → celebrate → empty → overflow) and only then resync to the live query.

## 3. Art direction — "premium"

Think Things 3 / Linear / Arc polish with a quiet fantasy-quest accent. Calm, tactile, expensive. Not gamer-neon.

- **Fonts** (self-hosted via `@fontsource-variable/*` — offline PWA, no CDN): `Inter Variable` for UI
  (`font-feature-settings: 'cv11','ss01'`, tabular nums for counts); `Fraunces Variable` only for display moments
  (page title, jar count, month name, celebration).
- **Surfaces.** Light: canvas `#F7F5F1` (warm ivory), cards white, 1px hairline borders `rgb(0 0 0 / .06)`, layered
  soft shadows. Dark: canvas `#0C0D10`, cards `#15161B`, borders `rgb(255 255 255 / .06)`, subtle inner highlight on
  top edge. Radii: cards 20px, controls 12px, chips 999px. Generous whitespace; 8px grid.
- **Category colors** (tokens in `@theme`, with dark variants; use the tokens everywhere — list, calendar, stones):
  - **DQ — Daily Quest**: jade `oklch(0.72 0.13 165)`; icon `Sunrise` (lucide)
  - **MQ — Main Quest**: gilded amber `oklch(0.78 0.14 75)`; icon `Crown`
  - **SQ — Side Quest**: iris `oklch(0.68 0.15 290)`; icon `Compass`
  - Each has `--color-{dq,mq,sq}`, `-soft` (tinted bg ~10–14% alpha), `-ink` (accessible text on soft bg).
- **Icons:** `lucide-react` only, stroke 1.75. No emoji or unicode glyphs in chrome.
- **Motion:** `motion` (framer-motion successor, `import { motion, AnimatePresence } from 'motion/react'`).
  Durations: 150ms micro, 240ms layout, 500–900ms celebratory. Spring for accordions/check marks. Every animation
  honors `prefers-reduced-motion`.
- **Feedback:** reuse `src/features/jar/feedback.ts` (`clink`, `buzz`) and respect `settings.sound`/`settings.haptics`.
- **Accessibility:** WCAG AA contrast in both themes, visible focus rings (`--color-ring`), keyboard operable
  accordions/calendar, `aria-*` on toggles. Dark mode follows `prefers-color-scheme` (existing `dark:` variant).

Deps installed in Phase 1 (no other agent edits `package.json`): `lucide-react`, `motion`,
`@fontsource-variable/inter`, `@fontsource-variable/fraunces`, `canvas-confetti`, `@types/canvas-confetti`.

## 4. Layout

- `md+` (≥768px): `[rail 64px] [quests minmax(360px, 1fr)] [right column 400–440px: calendar card, jar card]`.
  The rail **expands on hover/focus-within to ~220px as an overlay** (no column reflow), showing labels.
- `< md`: single column — header, quest lists, calendar, jar — with the existing `BottomNav`.
- The middle column header: date eyebrow, Fraunces title ("Today's quests" or similar), small summary chip
  (e.g. "3 of 7 done"), "New quest" primary button.

## 5. File ownership (parallel phase — do not edit files you don't own)

| Owner | Files |
|---|---|
| **Phase 1 – Foundation** | `src/db/*`, `src/features/quests/*.ts` (logic, hooks, meta, bus, tests), `src/features/marbles/engine.ts` (kind filter), `src/index.css`, `index.html`, `package.json`, `src/ui/styles.ts`, `src/main.tsx`, `src/dev/seed.ts` |
| **A – Shell & Quests** | `src/App.tsx`, `src/app/*`, `src/screens/HomeScreen.tsx`, `src/features/quests/components/*` |
| **B – Calendar** | `src/features/calendar/*` (exports `QuestCalendar` from `QuestCalendar.tsx`, no props) |
| **C – Jar** | `src/features/jar/*` (exports `QuestJar` from `QuestJar.tsx`, no props). The goal `JarCard` on Today must keep working. |

During the parallel phase, type errors in files you don't own are expected — don't fix them; note them in your report.
Don't `git commit`. Run `npx vitest run` and `npx tsc -b` before reporting.

## 6. Dev seed

`?seed=1` in dev (`import.meta.env.DEV`) wipes the DB and seeds, relative to today: ~3 DQ, ~3 MQ, ~4 SQ; the last
~20 days of history covering every status (`claimed` several, `ready` 2–3 unclaimed, `closed` 2, today `pending`,
future scheduled MQ/SQ), and a quest jar ~60% full with mixed categories/weights and 1 golden stone, and
1 sealed quest jar (so "Jars filled: 1"). `?seed=full` seeds the jar ~92% full with ready days enough to overflow,
for testing the celebration.

## Changelog

(Agents append deviations here: date — agent — change.)

- 2026-11-01 — Phase 1 — Packages installed as named (lucide-react, motion, @fontsource-variable/inter,
  @fontsource-variable/fraunces, canvas-confetti, @types/canvas-confetti). Fraunces is imported via its `opsz.css` (optical-size axis).
- 2026-11-01 — Phase 1 — Repo signatures are `(args, now?, database?)`: `now` comes before `database` on every repo
  function (create/update/delete/doItToday/complete/uncomplete/move). UI calls them with just the args.
- 2026-11-01 — Phase 1 — `claimAll(database?, now?, rng?)`: optional `rng` added (tests/seed); `database` defaults to the app db.
- 2026-11-01 — Phase 1 — `jarCapacityFor(quests, now, completions?)`: completions needed to know which undated quests are
  still open. 14-day window includes today (`today … today+13`). "activeDQ" = non-deleted DQs (incl. future start).
- 2026-11-01 — Phase 1 — Stone splitting is greedy: 4 → [3, 1], 5 → [3, 2], 7 → [3, 3, 1]. Stones are ordered by day, then
  dq/mq/sq. `Stone.at` = claim time + i ms so `(at, id)` sort equals drop order.
- 2026-11-01 — Phase 1 — Full jar: the stone that crosses capacity stays in the jar (Σ may exceed capacity by ≤ 2); later
  stones overflow. One claim can fill several jars (loop). A new empty jar is created right after sealing; its capacity is
  recomputed at the next claim until a stone lands. `DayClaim.jarId` = jar that received the day's first stone.
- 2026-11-01 — Phase 1 — Completing a quest on an already-claimed day is allowed (the checkbox reflects reality) but
  awards nothing; claims are final. Uncomplete is refused once the day is claimed.
- 2026-11-01 — Phase 1 — Integrity guards: createQuest rejects a DQ `startDate` or MQ/SQ `dueDate` before today; updateQuest
  rejects date changes on DQs, missed quests, quests already completed, and dates in the past.
- 2026-11-01 — Phase 1 — `deleteQuest` also withdraws that quest's completion for today if today isn't claimed (so deleting
  doesn't leave a stone for a quest that's gone today). Past completions are kept.
- 2026-11-01 — Phase 1 — `doItToday` sets `redoneAs` on the original and refuses a second copy. Added `Quest.redoneAs?`.
- 2026-11-01 — Phase 1 — Extra exports: `useQuestToday()` (everything the quest list needs, per-quest flags), `moveQuest`,
  `canUncomplete`, `isMissed`, `questWhen`, `daySummary`, `claimableDays`, `monthDays`, `sealedQuestJarCount`,
  `resolveCategoryColor`. `useQuestJar()` returns `jar: null` (not undefined) before any claim; `undefined` = loading.
- 2026-11-01 — Phase 1 — Token names: borders are `line`/`line-strong` (not `border`), extra `sunken` and `faint`.
  Tokens use `@theme static` so `var(--color-*)` exists for JS even when no utility references it.
- 2026-11-01 — Phase 1 — The dev seed sets the active quest jar's capacity after simulating history so the fill lands at
  ~60% / ~92%, and normalizes its stones to one golden; everything else comes from the real repo/claim functions.
- 2026-11-01 — Phase 1 — `src/features/quests/hooks.ts` imports `useToday` from `src/app/useToday.ts` (Agent A owns `src/app/*`): keep that export stable.
- 2026-11-01 — Phase 1 — OPEN: `vite.config.ts` (not owned) PWA precache only covers js/css/html; add `woff2` to
  `workbox.globPatterns` so self-hosted fonts work offline. Manifest `theme_color` there is still `#1c1917`.
- 2026-11-01 — Agent A — Routing: `href.home = '#/'` added; `href.today` keeps its key but is now `'#/today'`. Unknown hashes fall back to
  `home`. Nav entries: Home, Today, Goals, Settings (Settings pinned to the rail's bottom).
- 2026-11-01 — Agent A — Layout breakpoint: the 3-column Home grid starts at `lg` (≥1024px), not `md`: at 768px, 64px rail +
  360px quests + 400px right column doesn't fit. `md`–`lg` = rail + single column (quests, then calendar, then jar). Right column is
  400px at `lg`, 440px at `xl`, and sticky only when the viewport is ≥860px tall. `QuestCalendar`/`QuestJar` should fill their
  container's width (`w-full`), with no outer margins.
- 2026-11-01 — Agent A — The edit sheet can't change category (`QuestPatch` has no `category`); the picker is shown read-only.
  The date field is disabled for DQs, missed quests and completed quests, matching `updateQuest`'s guards.
- 2026-11-01 — Agent A — Quest lists fold "done on an earlier day" (`when === 'past'`) and already-redone missed quests into a
  per-section "N earlier" tail. The section count is done / (`when === 'today'` or done today), the same basis as
  `QuestToday.done/assigned`, so the counts add up to the summary chip. Upcoming quests are shown as locked.
- 2026-11-01 — Agent A — `MotionConfig reducedMotion="user"` wraps the app in `App.tsx`. Components still check
  `useReducedMotion()` for height/opacity animations, which MotionConfig doesn't disable.
- 2026-11-01 — B (Calendar) — `QuestCalendar` weeks start **Monday** (`WEEK_STARTS_ON = 1` in `src/features/calendar/model.ts`,
  matching `goals/progress.ts`); passed to `useMonth`, the local grid and the weekday header.
- 2026-11-01 — B — Claim button shows `Claim N days` plus a `+W` chip where W = `useClaimable().weight` (stone **weight**
  units = completions), not the number of stones (stones are split ≤ 3, so fewer). aria-label says "adding W stone weight".
- 2026-11-01 — B — `ClaimEvent.origins` holds **viewport** rects (`getBoundingClientRect`) read before `claimAll()`, keyed only
  by `result.days`. A claimed day not visible in the shown month uses the Claim button's rect. If `result.days` is empty
  (claimed elsewhere), nothing is emitted. The calendar calls `primeAudio()` and `buzz()` (if `settings.haptics`) on click;
  the jar owns clink sounds.
- 2026-11-01 — B — Future cells show category dots only for MQ/SQ (DQ recurs daily and would dot every cell); the tooltip
  still gives the full scheduled count. Effects/keyframes live in `src/features/calendar/calendar.css` (`qc-` prefix).
- 2026-11-01 — C (Jar) — `QuestJar` (no props) in `src/features/jar/QuestJar.tsx` plays claims from the event as specified
  (fly tokens → drop → celebrate → fade-out empty → overflow into the fresh jar → resync). Live-query changes that arrive
  without an event wait 450 ms (grace for the event), then drop new stones / restore a different jar in place. Tokens fly
  only for the first segment (≤ 12 days, only when the jar is on screen); overflow stones just fall. The readout clamps to
  capacity (a filling stone may overshoot by ≤ 2).
- 2026-11-01 — C (Jar) — `sim.ts`: items with `weight` are stone polygons (convex, seeded from the stone id so shape and tone
  survive reloads); area ∝ weight via `stoneRadius(capacity, weight)`, packing `stonePacking(capacity)` = 0.52 → 0.68 over
  capacity 21 → 150 (big stones pack looser). `PACKING` is now a plain number (marbles). Static corner wedges + slick walls.
  `JarSim.onImpact` is now `(speed, body)`; `clink(speed, weight = 1)` (heavier = lower pitch); new `chime()` in feedback.ts.
  `SimMarble.color` became optional (stones color by `category` from the theme at draw time).
- 2026-11-01 — C (Jar) — `JAR`/`WORLD` unchanged; the goal `JarCard`/`JarView` now draw the same new glass (`drawJar` wraps
  `drawScene`). Canvas colors go through `palette.ts#toRgb` (oklch tokens → rgb via a 1×1 canvas) since canvas-confetti only
  parses hex. Theme reacts to `prefers-color-scheme` changes only (that's what the tokens follow; `settings.theme` is unwired).
- 2026-11-01 — QA/Polish — **Theme is wired.** `Settings.theme` resolves onto `<html data-theme="light|dark">` (inline script in
  `index.html` sets it before first paint from a `localStorage.theme` mirror; `src/app/theme.ts#useThemeSync` keeps it synced and
  follows the OS while 'system'). Dark tokens in `index.css` and `calendar.css` key off `:root[data-theme='dark']`, `dark:` is a
  `@custom-variant` on the same attribute, and `color-scheme` follows it (native inputs). Jar canvas: `palette.ts#prefersDark` reads
  the attribute and `onSchemeChange` is a MutationObserver on it (JarView uses the same helper). Settings gains Appearance
  (System/Light/Dark) and Sound/Haptics switches; settings writes merge with `getSettings()` and `put` (the row may not exist).
- 2026-11-01 — QA/Polish — New `--color-danger`/`-soft`/`-ink` tokens; no `stone-*`, `red-*` or `dark:` classes remain in `src/`.
  Today/Goals/GoalDetail/GoalForm/Settings/JarCard moved onto tokens + lucide icons (no emoji or unicode arrows). Today's goal list is
  one column.
- 2026-11-01 — QA/Polish — `stonePacking` 0.52→0.68 became **0.60→0.70** (capacity 21→150): a 60% jar's mean pile surface went from
  ~43% to ~49% (peaks higher), and the full-jar tests (+2 overshoot under the mouth) still pass.
- 2026-11-01 — QA/Polish — Home right column uses a "sticky-bottom" top (`useStickyTop` in HomeScreen) so a column taller than the
  viewport scrolls until the jar is visible, then holds. On claim, `QuestJar.play` scrolls the whole jar card into view first, then
  re-reads day-cell rects (`[data-day]`) for the fly-in tokens. The full-jar readout says "Full! Sealing this jar…" instead of "Only 0 to go".
- 2026-11-01 — QA/Polish — `useToast`/`ToastContext` moved to `quests/components/toastContext.ts` (fast-refresh lint). QuestJar's
  `onClaim` subscription now sits after `play` is declared (lint). Touch screens (`hover:none`) get a per-row overflow menu
  (`RowMenu.tsx`, portaled, role=menu: Edit / Move up / Move down / Delete with a second-tap confirm). Deleting a quest (sheet,
  inline, or menu) moves focus to the next row, else the previous row, else the section header (`focus.ts#neighborOfRow`).
- 2026-11-01 — Claim-Rules — **Incremental claims** (user decision; replaces "claims are final"): if you claim in the afternoon
  and finish more quests/cards later that day, today glows `ready` again; the next Claim drops **only the new stones**. Nothing
  earned is ever lost. Claim state now lives on the completion: `QuestCompletion.claimedAt?` (ISO) + `claimJarId?`. A
  **claimed completion is permanent** (can't be un-completed, withdrawn, or removed by deleting its quest); an unclaimed one
  made today can still be undone, even after an earlier claim. Dexie `version(4)` (same indexes) migrates old data: every live
  completion on a day with a `DayClaim` is marked claimed. Backup schema **4**; v1–v3 files still import (v1–v3 get the same
  migration on import, so old claimed days don't re-award). Helper `markClaimedFromDayClaims` in `db/db.ts`.
  - `DayClaim` stays one row per day: `jarId` = jar of the day's first-ever stone, `claimedAt` = latest claim, `weight` = Σ over
    all claims. A re-claim updates it (no second row).
  - `dayStatus`/`daySummary`/`monthDays`: `ready` = all assigned done **and** ≥1 unclaimed completion (claimed days included).
    `claimed` = has a DayClaim (or claimed completions) and isn't ready. Edge: a claimed **today** with new completions but a
    quest added after the claim still open → `pending`; a claimed **past** day in that state stays `claimed` (never `closed`).
    The `claimed: boolean` param now means "a DayClaim exists for this day"; `claimedAt` is the source of truth.
  - `claimableDays` lists days with unclaimed completions that are ready (incl. re-ready claimed days). `claimAll` claims only
    unclaimed completions (stones from those units only), stamps them in the same rw transaction (idempotent / two-tab safe),
    `ClaimResult` unchanged — `result.days` can include a day that was claimed before.
  - `completeQuest` after a claim now earns (old "recorded but earns nothing" policy removed). `uncompleteQuest`: same day and
    that completion unclaimed. `deleteQuest` withdraws today's **unclaimed** completions of the quest even if today has a claim.
  - `canUncomplete(q, completions, todayClaimed, now)`: signature kept, `todayClaimed` is now ignored; true iff the quest has a
    live completion today with no `claimedAt`. `QuestItem.canUncomplete` follows. New additive `QuestItem.claimed?: boolean`
    (today's completion of this quest is claimed). `QuestToday.claimed` = today has a DayClaim (it can be `ready` again — use
    `status` for the glow; QuestRow's "Today is claimed, so this stays done" copy stays correct for rows with canUncomplete=false).
  - `useClaimable().weight` = units of **unclaimed** completions on claimable days (the `+W` chip no longer counts stones already
    in the jar). `useMonth`/`useQuestToday` reflect re-ready today with no UI change.
