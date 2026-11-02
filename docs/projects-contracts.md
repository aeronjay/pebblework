# Project Quests & Kanban Boards — Build Contracts

Extends the Quest Home (read `docs/home-spec.md` and `docs/home-contracts.md` first — tokens, art direction, existing
rules all still apply). Same stack and code style. Append deviations to the Changelog at the bottom.

## 1. What the user asked for

> "When I create quests, it's kinda like a project thing, like a kanban board when I click it. For example I create a
> side quest 'Making a Game: GAMENAME', then put stages on that game, like 'add login/logout', etc. It could have
> subtasks. When clicked it goes into a kanban board." Also: "change the nav bar icons and everything" — must look premium.

## 2. Product decisions (confirmed with the user — do not relitigate)

- **Which quests:** MQ and SQ can optionally be a **project** (toggle in the create sheet). DQ stays a simple habit.
- **Columns:** a new board starts with `To do / In progress / Done`. Per project the user can rename, add, reorder and
  delete columns. **The last column (highest `order`) is the "done" column.** Min 2 columns.
- **Cards** ("stages", e.g. "Add login/logout") live in columns; each card can have **subtasks** (checklist).
- **Rewards — cards earn stones:** moving a card into the done column creates a completion for **today** (local day key)
  in the parent quest's category. It counts toward today's intensity/stones like any completion.
  **Finishing the whole project** (explicit "Complete project" action) gives a bonus completion worth **3 units**.
  Subtask checks earn nothing (they're progress UI only).
- **Same-day rule for cards:** cards can be finished any day; the completion is stamped with the day it's moved to done
  — never backdated. Card due dates are optional **reminders only** and never block calendar days. Project quests are
  **never "assigned" to a day** (treated like undated for assignment, even if they have a deadline `dueDate`), so they
  never block a day, and their deadline is display-only.
- **Integrity:**
  - One completion per card ever (id `card:${cardId}`) — moving a card out and back in can't double-award.
  - Moving a card **out** of done (or deleting it) removes its completion **only if** it was stamped today and today
    isn't claimed; otherwise the completion stays (honestly earned) and the card just moves.
  - Same rule for un-completing a project (bonus id `project:${questId}`).
  - Card completions must **not** mark the parent quest itself as done (`isQuestDone`/`canComplete` ignore completions
    that have `cardId` or `kind: 'project'`).
- **Delete:** deleting a column requires moving its cards (UI asks which column; default first column). Deleting a
  project soft-deletes its columns/cards; past completions remain.

## 3. Data (Phase 1 owns)

```ts
// Quest gains:
isProject?: boolean          // MQ/SQ only
projectDoneAt?: string       // ISO, set by completeProject

// QuestCompletion gains:
cardId?: string              // set for card completions (id = `card:${cardId}`)
kind?: 'quest' | 'card' | 'project'   // undefined = 'quest'
units?: number               // default 1; project bonus = 3. stonesForDay / intensity sum units.

export interface BoardColumn extends Meta {
  id: string; questId: string; title: string; order: number
}

export interface Subtask { id: string; title: string; done: boolean }

export interface Card extends Meta {
  id: string; questId: string; columnId: string; title: string; order: number
  note?: string; dueDate?: string /* dayKey reminder */; subtasks: Subtask[]
  doneAt?: string            // ISO when last entered done column
}
```

Dexie `version(3)`: `boardColumns: 'id, questId, updatedAt'`, `cards: 'id, questId, columnId, updatedAt'`,
`questCompletions` adds `cardId` index. Backup includes new tables (schema 3, still imports 1 & 2).

`src/features/board/` (Phase 1 writes logic + tests; UI agent adds components):
- `repo.ts`: `createProjectBoard(questId)` (default columns; called by `createQuest` when `isProject`),
  `addColumn(questId, title)`, `renameColumn(id, title)`, `moveColumn(id, toIndex)`, `deleteColumn(id, moveCardsTo)`,
  `addCard(questId, columnId, title)`, `updateCard(id, patch)`, `deleteCard(id)`,
  `moveCard(id, toColumnId, toIndex, now?)` (handles completion award/withdraw per §2),
  `addSubtask/toggleSubtask/renameSubtask/deleteSubtask/moveSubtask`, `completeProject(questId, now?)`,
  `reopenProject(questId, now?)`. All take optional `now`, `database` last. Rule violations throw `QuestError`.
- `hooks.ts`: `useBoard(questId): { quest, columns, cardsByColumn: Record<string, Card[]>, doneColumnId, progress: { done, total } } | undefined`,
  `useProjects(): Array<{ quest, done, total, columns: number, lastActivity?: string }>`.
- Fractional or integer `order` — your choice, but reordering must be stable and tested.

Routes (Phase 1 adds to `src/app/router.ts` + tests): `#/quests/:id` → `{ name: 'board'; id }`,
`#/projects` → `{ name: 'projects' }`; `href.board(id)`, `href.projects`. Phase 1 wires them in `App.tsx` to
placeholder screens `src/screens/BoardScreen.tsx` and `src/screens/ProjectsScreen.tsx` (one-line stubs the UI agents
replace).

Deps (Phase 1 installs; nobody else touches package.json): `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

Seed: extend `?seed=1` with an SQ project "Making a Game: Starfall" (columns To do / In progress / Playtest / Done,
~9 cards incl. "Add login/logout" with 4 subtasks half done, a card with a due-date reminder, 2 cards done earlier
days, 1 done today) and an MQ project "Launch portfolio site" with 3 columns.

## 4. Board UX (Agent B builds)

Premium Linear/Height-style board:
- Header: back link, category chip + icon, project title (Fraunces), deadline pill, progress ring + "5/9 stages",
  "Complete project" button (enabled any time; confirm if open cards remain), overflow menu (rename, delete project).
- Columns: horizontal scroll with snap on mobile, soft surface columns, header with title (inline rename), count,
  column menu (rename, move left/right, delete with "move cards to" picker), "+ Add card" at bottom, "+ Add column" at end.
  Done column has a subtle category-tinted header and check icon.
- Cards: title, subtask progress bar + "2/4", due reminder chip (muted, "Due Fri"), note indicator. Drag & drop between
  and within columns (dnd-kit, pointer + keyboard sensors, drag overlay with lift/tilt shadow, smooth layout animation).
  Dropping into done: satisfying micro-moment (card check pulse + `clink`/`buzz` honoring settings + toast
  "+1 stone ready to claim today").
- Card detail: side drawer (sheet on mobile) — title edit, note, due reminder, subtasks checklist (add, toggle, rename,
  reorder, delete), column picker, delete card.
- Empty board / empty column states with elegant copy. Keyboard accessible, reduced motion honored, AA in both themes.

## 5. Shell, nav & list integration (Agent A builds)

- **Custom nav icon set** (replace lucide in the rail + bottom nav): bespoke inline-SVG icons in one consistent style
  (24px grid, 1.75 stroke, rounded joins), with a filled/duotone **active** variant using a subtle accent. Tabs:
  **Home** (a jar), **Projects** (board/columns), **Today** (sunrise), **Goals** (flag/target), **Settings** (dial).
  Refresh the rail: wordmark/logo mark, active indicator, hover expansion polish, tooltips when collapsed.
- `ProjectsScreen` (`#/projects`): grid of project cards (category tint, title, progress ring, columns/cards counts,
  deadline, last activity), filter chips (All / Main / Side), "New project" opens the quest sheet preset to project.
- Quest sheet: "Make this a project" toggle for MQ/SQ (with a one-line explanation + mini board preview icon);
  deadline label instead of due date when project.
- Quest list rows for projects: distinct project row (board icon, progress bar "3/9 stages", next card title), the whole
  row navigates to `href.board(id)`; no checkbox (completion happens on the board).

## 6. File ownership (parallel phase)

| Owner | Files |
|---|---|
| Phase 1 – Foundation | `src/db/*`, `src/features/quests/*.ts`, `src/features/board/{repo,hooks,*.test}.ts`, `src/app/router.ts` (+test), `App.tsx` (route wiring only), stub screens, `src/dev/seed.ts`, `package.json` |
| A – Shell & integration | `src/app/Nav.tsx`, `src/app/icons/*` (new), `src/App.tsx` (layout), `src/screens/ProjectsScreen.tsx`, `src/features/quests/components/*`, `src/features/projects/*` (new) |
| B – Board | `src/screens/BoardScreen.tsx`, `src/features/board/components/*` |

Don't commit. Before reporting: `npx vitest run`, `npx tsc -b`, `npm run lint`. Errors in files you don't own are
expected mid-flight — note, don't fix.

## Changelog

- 2026-11-01 — Phase 1 — Deps installed: `@dnd-kit/core@^6.3.1`, `@dnd-kit/sortable@^10.0.0`, `@dnd-kit/utilities@^3.2.2`.
- 2026-11-01 — Phase 1 — Data as §3, plus `type CompletionKind = 'quest' | 'card' | 'project'` exported from `db/types.ts`. Dexie
  `version(3)` adds `boardColumns: 'id, questId, updatedAt'`, `cards: 'id, questId, columnId, updatedAt'`, and the `cardId` index on
  `questCompletions`. Backup schema 3 (tables `boardColumns`, `cards`); v1/v2 files still import (and clear local board tables).
- 2026-11-01 — Phase 1 — `QuestInput.isProject?: boolean`. `createQuest` throws `QuestError` for a DQ project and creates the default
  board in the same transaction. `QuestError` now lives in `src/features/quests/errors.ts` (re-exported from `quests/repo.ts`, so
  existing imports keep working) to avoid an import cycle with `board/repo.ts`.
- 2026-11-01 — Phase 1 — **Quest rules for projects** (`day.ts`): `isProject(q)`; `isUndated(q)` is true for projects (deadline is
  display-only); `isAssigned` → false; `canComplete` → false (so `completeQuest` returns false); `isMissed` → false;
  `questWhen` → `'anytime'`, or `'past'` once `projectDoneAt` is before today; `isQuestDone` → `!!projectDoneAt`. Every per-quest
  predicate ignores card/project completions (`isQuestCompletion(c)`). `updateQuest` lets a project's deadline change even after
  card completions or once passed (only past dates are refused). `deleteQuest` on a project soft-deletes its columns/cards and
  withdraws today's unclaimed completions of that quest (cards + bonus); earlier ones stay.
- 2026-11-01 — Phase 1 — **Units.** New `day.ts` exports `units(c)`, `sumUnits(cs)`, `cardCompletionId(cardId)` = `card:${cardId}`,
  `projectCompletionId(questId)` = `project:${questId}`, `isQuestCompletion(c)`, `isProject(q)`. `stonesForDay`, `intensity`,
  `DaySummary.done`/`MonthDay.done` and `useClaimable().weight` sum units. `DaySummary.assigned` is now
  `done units + assigned quests not yet done that day` (identical for old data; guarantees `done ≤ assigned`). Note for Agent A:
  card/bonus units count in `QuestToday.done/assigned` but have no row in the per-quest sections (`QuestItem.doneToday` is the quest
  itself only). `jarCapacityFor`: an open project (no `projectDoneAt`) counts 1 like an open undated quest, never as "due soon".
- 2026-11-01 — Phase 1 — **Ordering.** Integer `order`, renumbered to 0..n-1 on every insert/move/delete; ties sort by
  `(order, createdAt, id)`. Every `toIndex` = **final index in the destination list after removing the item** (dnd-kit
  `arrayMove` semantics), clamped to the valid range.
- 2026-11-01 — Phase 1 — **Award/withdraw rules (state-based).** Whenever a card's column *changes* (moveCard to another column,
  addCard, deleteColumn moving it), it settles against the current done column: entering done sets `doneAt` and stamps
  `card:${id}` today unless a live one exists (one live completion per card, ever; a withdrawn row is re-stamped in place);
  landing in a non-done column withdraws its completion only if stamped today and today is unclaimed. Reordering within a
  column never touches completions. `deleteCard` withdraws by the same rule. On an already-claimed day a new completion is
  recorded but earns nothing (like `completeQuest`), and since it stays live that card can't earn again. `CardMoveResult.awarded`
  is true only when the move adds to today's *unclaimed* stones (drive the "+1 stone ready to claim today" toast from it);
  `todayClaimed` lets the UI word the claimed-day case differently.
- 2026-11-01 — Phase 1 — **Column reorders never create or withdraw completions.** Moving a column can change which column is
  done; `progress.done` follows the columns immediately (cards now in the done column count), but stones only change on the next
  card move (e.g. a card sitting in the new done column earns when it leaves and re-enters; a card holding today's completion in a
  now-non-done column loses it when it next changes column). `doneAt` keeps the last time the card *entered* done (not cleared on exit).
- 2026-11-01 — Phase 1 — `addColumn(questId, title, index?)` inserts **before the done column** by default (so Done stays done);
  `index >= count` appends and the new column becomes done. "+ Add column at end" in §4 is only the button's position.
  `addCard` straight into the done column awards like a move. `deleteColumn` appends the moved cards (in order) to the end of
  `moveCardsTo` and settles them against the done column as it stands after the deletion (so deleting the done column into the
  column that becomes done keeps completions). Refused below 2 columns, into itself, or into another board.
- 2026-11-01 — Phase 1 — `completeProject` throws if already complete (or not a project / deleted); returns `true` if the bonus
  counts toward today's unclaimed stones, `false` if a bonus from an earlier completion still stands (no double award) or today is
  already claimed (the bonus is recorded but earns nothing). `reopenProject` throws if not complete;
  returns whether the bonus was withdrawn (only same day + unclaimed). Card moves/edits stay allowed on a completed project.
  Every board mutation throws `QuestError` ('Project not found.', 'Card not found.', …) on a deleted/non-project quest.
- 2026-11-01 — Phase 1 — `useBoard` returns `null` when the quest is missing, deleted, or not a project (`undefined` = loading).
  `useProjects` returns `undefined` while loading; summaries add `nextCard?` (first card of the first non-done column) for the quest
  list row. `lastActivity` = latest `updatedAt` among live columns/cards. Completed projects are included (UI filters). Both hooks are
  thin `useLiveQuery` wrappers over `loadBoard`/`loadProjects` in `repo.ts`.
- 2026-11-01 — Phase 1 — Routes: `#/quests/:id` → `{ name: 'board', id }`, `#/projects` → `{ name: 'projects' }` (bare `#/quests`
  falls back to home); `href.board(id)`, `href.projects`. App.tsx wiring only — the board route still uses the narrow `main`
  layout (`wide` is only `home`); Agent A may want `board` wide.
- 2026-11-01 — Phase 1 — Seed `?seed=1` adds SQ "Making a Game: Starfall" (To do / In progress / Playtest / Done, 9 cards; "Add
  login/logout" 2/4 subtasks; "Settings menu" due-reminder in 3 days; cards done on day -6 (claimed) and -2 (ready), "Main menu" done
  today) and MQ "Launch portfolio site" (3 default columns, 3 cards, deadline +20 days). Existing seed guarantees unchanged.

### Final API — `src/features/board/repo.ts` (all writes: `now` defaults to `new Date()`, `database` to the app db)

```ts
const DEFAULT_COLUMNS = ['To do', 'In progress', 'Done'], MIN_COLUMNS = 2, PROJECT_BONUS_UNITS = 3
interface CardPatch { title?: string; note?: string | null; dueDate?: string | null } // null clears
interface CardMoveResult { awarded: boolean; withdrawn: boolean; todayClaimed: boolean } // awarded = adds to today's unclaimed stones
interface BoardState { quest: Quest; columns: BoardColumn[]; cardsByColumn: Record<string, Card[]>; doneColumnId: string
  progress: { done: number; total: number } }
interface ProjectSummary { quest: Quest; done: number; total: number; columns: number; lastActivity?: string; nextCard?: Card }

sortByOrder<T extends { order: number; createdAt: string; id: string }>(list: T[]): T[]
doneColumnOf(columns: BoardColumn[]): BoardColumn | undefined
createProjectBoard(questId: string, now?: Date, database?: MarbleDB): Promise<string[]>          // column ids; idempotent
addColumn(questId: string, title: string, index?: number, now?: Date, database?: MarbleDB): Promise<string>
renameColumn(id: string, title: string, now?: Date, database?: MarbleDB): Promise<void>
moveColumn(id: string, toIndex: number, now?: Date, database?: MarbleDB): Promise<void>
deleteColumn(id: string, moveCardsTo: string, now?: Date, database?: MarbleDB): Promise<void>
addCard(questId: string, columnId: string, title: string, now?: Date, database?: MarbleDB): Promise<string>
updateCard(id: string, patch: CardPatch, now?: Date, database?: MarbleDB): Promise<void>
deleteCard(id: string, now?: Date, database?: MarbleDB): Promise<CardMoveResult>
moveCard(id: string, toColumnId: string, toIndex: number, now?: Date, database?: MarbleDB): Promise<CardMoveResult>
addSubtask(cardId: string, title: string, now?: Date, database?: MarbleDB): Promise<string>
toggleSubtask(cardId: string, subtaskId: string, done?: boolean /* omit = flip */, now?: Date, database?: MarbleDB): Promise<void>
renameSubtask(cardId: string, subtaskId: string, title: string, now?: Date, database?: MarbleDB): Promise<void>
deleteSubtask(cardId: string, subtaskId: string, now?: Date, database?: MarbleDB): Promise<void>
moveSubtask(cardId: string, subtaskId: string, toIndex: number, now?: Date, database?: MarbleDB): Promise<void>
completeProject(questId: string, now?: Date, database?: MarbleDB): Promise<boolean>   // bonus earns today?
reopenProject(questId: string, now?: Date, database?: MarbleDB): Promise<boolean>     // bonus withdrawn?
loadBoard(questId: string, database?: MarbleDB): Promise<BoardState | null>
loadProjects(database?: MarbleDB): Promise<ProjectSummary[]>
```

UI calls: `await moveCard(id, toColumnId, toIndex)`, `await addColumn(questId, title)`, `await toggleSubtask(cardId, subId)`.

### Final API — `src/features/board/hooks.ts`

```ts
export type { BoardState, ProjectSummary }
useBoard(questId: string): BoardState | null | undefined   // undefined = loading, null = not a live project
useProjects(): ProjectSummary[] | undefined                 // undefined = loading
```
- 2026-11-01 — Claim-Rules — **Incremental claims** (see home-contracts Changelog for the full rule). Cards and project bonuses
  finished **after** today's claim now earn: they make today `ready` again and drop on the next claim. Withdraw rule (card
  out of done, `deleteCard`, `reopenProject`, `deleteQuest`) = same day **and that completion is unclaimed** (was: "today isn't
  claimed"). A claimed card/bonus completion is permanent; the card still can't earn twice (one completion per card, ever).
  - `CardMoveResult.awarded` = a new completion was stamped (it always earns on the next claim). `withdrawn` unchanged.
    **`todayClaimed` keeps its name but now means "this card's live completion has already been claimed"** (so it can't be
    withdrawn / won't earn again) — not "today has a claim".
  - `completeProject` returns `true` whenever it stamps a new bonus (also after a claim); `false` only if an earlier bonus still
    stands. `reopenProject` returns whether the bonus was withdrawn (same day + unclaimed).
  - UI follow-ups (Board agent): `Board.tsx#onAddCard` derives `awarded: !claimed` from `db.dayClaims` — a card added straight
    into Done now always awards (`awarded: true, todayClaimed: false`). `runComplete` no longer needs the `dayClaims` read
    (`earned` is enough). `moveMessage`'s "Today's already claimed, so it's logged without a stone" case now means the card's
    stone was already claimed earlier; `projectMessage`'s `todayClaimed` branch is now dead (`earned === false` only means an
    earlier bonus still stands).

- 2026-11-01 — Agent A — **Nav icons** live in `src/app/icons/NavIcons.tsx`: `HomeIcon` (jar + stones), `ProjectsIcon` (3 kanban columns),
  `TodayIcon` (sunrise), `GoalsIcon` (flag), `SettingsIcon` (sliders), `LogoMark` (tile drawn with theme + category tokens, replaces
  `/icon.svg` in the rail). Props `{ active?, className? }`; the active duotone uses a currentColor wash plus `--nav-accent`
  (defaults to `--color-mq`; set it inline to tint, as ProjectRow/QuestSheet do with category colors). Lucide stays for in-content icons.
- 2026-11-01 — Agent A — **Rail tooltips:** the rail now opens on **hover-intent** (420 ms dwell, mouse only) or keyboard focus-visible
  (immediately), driven by JS state rather than CSS `:hover`. While collapsed, the hovered icon shows a tooltip, rendered as a
  `position: fixed` sibling of the nav (the nav clips overflow). It hides once the rail expands. Labels stay in the DOM.
  Tabs: Home, Projects (`['projects','board']`), Today, Goals, Settings (pinned bottom). The active indicator is a surface pill + amber edge bar.
- 2026-11-01 — Agent A — Layout: `home` and `board` use the full-width `main`; `projects` uses `max-w-[1200px]`; the rest are unchanged.
- 2026-11-01 — Agent A — `SheetTarget` create gains `project?: boolean`. Creating a project navigates to `href.board(id)`. For projects the
  sheet hides Time, relabels the date "Deadline · optional" (quick picks: In a week / In a month / None) and never locks the
  date (fixes the open issue; `min=today` still blocks past dates). The toggle shows only for MQ/SQ. When editing, it shows (read-only)
  only for existing projects, since a quest can't change kind.
- 2026-11-01 — Agent A — `describe.ts` gains `describeProject(q, todayKey)` ("Deadline Fri" / "Past deadline · Oct 3" /
  "Completed today"), and `describeQuest` routes projects to it. Project rows (`ProjectRow.tsx`) use one `useProjects()` call in
  `QuestLists` (a Map passed down). Row actions moved into a shared `RowActions.tsx`, used by both row types.
  `focus.ts#neighborOfRow` now also accepts `a[href]` (signature unchanged).
- 2026-11-01 — Agent A — Projects helpers are in `src/features/projects/model.ts` (sort: open by `lastActivity` desc, then completed; deadline
  tone; relative "Updated …"). Home quick-access strip: skipped (the header has no clean room, and it risks `useStickyTop`).
- 2026-11-01 — Agent B (Board) — `BoardScreen` wraps itself in `ToastProvider` (only HomeScreen had one). Components live in
  `src/features/board/components/`: `Board` (dnd orchestration), `BoardHeader`, `BoardColumn` (`SortableColumn`/`ColumnShell`),
  `BoardCard` (`CardFace`/`SortableCard`), `CardDrawer`, `SubtaskList`, `DeleteColumnDialog`, `Dialog`, `Menu`, `BoardStates`
  (skeleton / not-found), plus pure helpers in `model.ts` (+ `model.test.ts`) and `a11y.ts`.
- 2026-11-01 — Agent B — DnD: `MouseSensor` (6px) + `TouchSensor` (200ms long-press) + `KeyboardSensor`, not `PointerSensor`, so
  horizontal swipe / scroll-snap keep working on touch. Keyboard: **Space** picks up / drops, **Enter** opens a card (Enter
  also drops mid-drag). Columns are dragged by a grip handle in the header (it shows on hover/focus, always faintly on coarse
  pointers), or moved with the column menu's Move left/right. Layout is optimistic: the local order holds until the live query delivers a
  newer `BoardState`, then the live data wins. On a repo error the board reverts and shows a toast.
- 2026-11-01 — Agent B — Feedback: entering the done column plays `useCompleteFeedback()` (clink + buzz, honoring settings),
  then a check pulse on the card. Toasts come from `model.ts#moveMessage`: `awarded` → "+1 stone — claim it on the calendar";
  entered done without an award → "already earned its stone earlier"; `withdrawn` → "today's stone was returned". Plain moves
  get no toast. `addCard` into done reports `awarded: true` per the new claim rules. Complete project fires a small
  category-colored confetti burst (skipped under reduced motion) and the "+3 stones" toast when it earns.
- 2026-11-01 — Agent B — "Back" goes to the page the user came from. `model.ts` tracks `hashchange.oldURL`, labels the link
  (Projects / Home / Today…) and uses `history.back()`. On a direct load the link falls back to `href.home`. Deleting a project
  navigates (replace) to `href.projects`.
- 2026-11-01 — Agent B — "+ Add column" sits at the end of the board but calls `addColumn(questId, title)`, so the new column
  goes **before** done; the form says so. The column menu explains done-column side effects ("This becomes the done column",
  "“X” becomes the done column"). Delete is disabled at `MIN_COLUMNS`. When the column has cards, a dialog asks for the target
  (default: first other column).
- 2026-11-01 — Visual QA — **Board layout.** `Board` fills the viewport (`min-h-[calc(100dvh-8rem)]`, md `-5rem`) and the column
  scroller stretches, so columns are full-height lanes (the whole lane is a drop zone via the sortable column node). Lanes: `bg-sunken/60`
  (dark `white/2.2%`), 288px on md+. The lane holding the dragged card gets a category wash + hairline (`ColumnProps.dropTarget`). Empty
  lanes no longer turn blue while dragging (only the target lane is highlighted). The scroller fades its edges (mask to 18% alpha, so a
  peeking column stays visible) only where there's more to scroll. "Add column" is a 56px full-height dashed lane with a vertical label on
  md+ (a tile on phones), so 4 columns + Add fit at 1440.
- 2026-11-01 — Visual QA — **Board header.** The progress ring pill is gone. A segmented meter (one segment per stage, a continuous bar past 24)
  with "3/9 stages · 33%" runs the full width under the header. Complete + overflow sit on the title line (`lg:mt-[35px]`).
- 2026-11-01 — Visual QA — **Cards.** Hover lift (-1px + pop shadow, on `CardFace`, never the sortable node), a category hairline on the leading
  edge on hover/focus/drag, and meta as soft chips: subtask mini-ring + count (a check once all done), due reminder, note.
- 2026-11-01 — Visual QA — **Card drawer reminder.** The native date input is hidden (its empty state read "mm/dd/yyyy"). Empty: "Pick a date"
  (opens the picker via `showPicker()`, focus fallback) + "Tomorrow" / "Next week" (hidden under 440px). Set: a chip "Mon, Nov 2 · tomorrow" (re-opens the picker) + clear button.
  Elsewhere, empty date inputs with `data-empty` (QuestSheet) render the mm/dd/yyyy mask in `--color-faint` (index.css).
- 2026-11-01 — Visual QA — **Toast copy** (`moveMessage`/`projectMessage` take `openQuests`, from `useQuestToday`: assigned − done). The card
  stone is always stamped, but today is only claimable once its assigned quests are done, so the toast now says "+1 stone for today — finish
  today’s 2 quests to claim it" instead of always "claim it on the calendar" (which pointed at "Nothing to claim yet").
- 2026-11-01 — Visual QA — **Shell.** `LogoMark` tile no longer flips to white in dark mode: near-black in light, graphite `#2a2b33` + white/10
  hairline in dark, jar always ivory. Expanded-rail active pill is a tinted wash (`ink/6.5%`, dark `white/7.5%`) instead of a white pill on the
  white panel; rail hover is a lighter wash so it doesn't compete. `ProjectsIcon` redrawn as a framed board with three card-lines (the three
  outlined bars read dense/heavy at 20px next to the other glyphs); the done line becomes an accent pill when active. Done project tile in
  `ProjectRow`: dark check on the category color (white on amber failed AA).
