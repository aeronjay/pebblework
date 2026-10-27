# Goal Tracker — Spec (v1)

> Working name: **Marble Jar** (placeholder)

## 1. Vision

A local-first goal tracker built around one idea: **every bit of progress drops a marble into a jar you can see filling up.** The app uses well-studied motivation psychology to make showing up feel rewarding, and to make *missing* a day recoverable instead of shameful.

**Success = the user is still opening the app after 90 days.** Every feature is judged against that.

## 2. Psychological principles (design pillars)

| Principle | What it means | How the app uses it |
|---|---|---|
| **Progress Principle** (Amabile) | Small, visible wins are the strongest day-to-day motivator. | Every check-in drops a physical marble immediately, with sound + haptics. |
| **Goal-gradient effect** | Effort speeds up as a finish line gets closer. | The jar has a fixed capacity; "almost full" state (≥80%) is visually highlighted ("12 marbles to go"). |
| **Identity-based habits** (Atomic Habits) | Each action is a "vote" for who you're becoming. | Goals have an optional identity statement ("I am someone who reads"). Marble drop shows "+1 vote for: Reader". |
| **Lenient streaks / "never miss twice"** | Hard streaks cause the "what-the-hell" effect: one miss → quit. | Streaks survive a single miss; earn **freeze tokens** to protect them. A miss is never shown as a big red 0. |
| **Variable rewards** | Unpredictable rewards are more engaging than fixed ones. | Random **golden / rare marbles**; unlockable marble skins and jar styles. |
| **Fresh-start effect** | Temporal landmarks (Monday, new month, new jar) trigger renewed effort. | New-jar ritual; gentle "fresh start" prompt on Mondays / 1st of month after inactivity. |
| **Implementation intentions** | "When X, I will Y" plans roughly double follow-through. | Goal creation asks for an optional *when/where* cue. |
| **Endowed progress** | People persist more when they feel they've already started. | New jars start with a few "starter" marbles carried over from the last jar. |
| **Reflection** | Reviewing progress consolidates meaning and identity. | Optional one-line note/mood on completion; weekly review screen. |
| **Collection / trophy room** | Visible history counters "I never stick with anything." | Filled jars are sealed, labeled, and placed on a **Shelf**. |

**Anti-patterns to avoid:** guilt messaging, punishing visuals for misses, notification spam, losing marbles (marbles are **never removed** for missing — only for undoing a mistaken check-in).

## 3. Core concepts

### 3.1 Goals
Three goal types:

1. **Habit** — recurring action.
   - Schedule: daily, N times per week, specific weekdays.
   - Check-in = 1 completion for that period.
2. **Project** — one-off goal broken into **milestones** (ordered checklist).
   - Completing a milestone and completing the project both earn marbles.
3. **Numeric target** — measurable quantity (e.g. save $5000, run 100 km).
   - Log increments; marbles awarded per configurable chunk (e.g. every 10 km) plus a bonus on reaching the target.

Common goal fields: title, type, color (= marble color), optional identity statement, optional implementation intention ("when/where"), optional deadline, status (active / paused / completed / archived).

### 3.2 Marbles (effort-weighted)
| Event | Marbles |
|---|---|
| Habit check-in | 1 |
| Numeric chunk reached | 1 |
| Project milestone completed | 3 |
| Streak milestone (7 / 30 / 100 periods) | 3 / 5 / 10 |
| Goal/project completed | 10 |
| Weekly review completed | 1 |

- Marble color = the goal's color, so the jar becomes a visual mix of your life.
- **Rare marbles:** each earned marble has a small chance (~5%) to be **golden** (worth the same, looks special, counted in stats). Even rarer variants (~1%) unlock cosmetics.
- Values live in a single config so they can be tuned.

### 3.3 The Jar (one shared jar)
- One active jar at a time; all goals pour into it.
- Default capacity: **100 marbles** (user can choose 50 / 100 / 200 when starting a jar).
- Rendered with **2D physics**: marbles drop from the top, bounce, and settle. Sound + vibration (where supported).
- States: empty → filling → almost full (≥80%, subtle glow + "N to go") → **full**.
- **Full-jar ritual:** celebration animation → user names/labels the jar (default: date range) → jar is sealed with a lid and moves to the Shelf → new jar starts with 3 endowed "starter" marbles.
- Overflow marbles from the drop that filled the jar carry into the next jar.

### 3.4 Shelf (trophy room)
- Grid/shelf of all sealed jars, each showing its marbles frozen in place, label, date range, and breakdown by goal.
- Tap a jar → stats: marbles per goal, golden marbles, notes written during that jar.

### 3.5 Streaks (lenient)
- Streak counts consecutive **periods** (day/week depending on schedule) where the habit was met.
- **Never miss twice:** a single missed period does not break the streak; it marks it "at risk." Two consecutive misses break it.
- **Freeze tokens:** earn 1 per 7-period streak (max 3 held); a token auto-covers a miss.
- Broken streak UI shows "Best: 42 · Current: 0 — start again today" (neutral tone, no red).

### 3.6 Reflection
- After a check-in: optional one-line note + mood (1–5 emoji). Skippable with one tap; never blocking.
- **Weekly review** (prompted on the user's chosen day): marbles this week, per-goal summary, "what went well / what got in the way / one tweak for next week." Completing it earns a marble.

### 3.7 Rewards & cosmetics
- Unlockables: marble skins (glass, galaxy, wood…), jar styles, shelf backgrounds.
- Unlocked by milestones (first full jar, 5 jars, 30-day streak, rare-marble drops).
- Purely cosmetic; no currency/shop in v1.

### 3.8 Reminders
- Per-goal reminder time(s); global quiet hours.
- **v1 limitation:** a local-only PWA has no server to send push. v1 uses the Notifications API while the app/service worker is active, plus in-app nudges on open. Reliable scheduled push arrives with the optional cloud backend (see §6).
- Tone: friendly, short, identity-framed ("Time to cast a vote for Reader 📖"). Max 1 reminder per goal per day; auto-mute a goal's reminders after 7 ignored in a row (and tell the user).

## 4. Screens

1. **Home / Jar** — the jar (physics view) front and center; below it today's due items with one-tap check-in. Capacity counter and "N to go."
2. **Goals** — list grouped by type; create/edit/pause/archive.
3. **Goal detail** — progress (streak, milestones, or numeric progress bar), history calendar heatmap, notes.
4. **Create goal flow** — type → title/color → schedule/milestones/target → identity statement (optional) → when/where cue (optional) → reminder (optional). Must be completable in <30 seconds with only the required fields.
5. **Shelf** — sealed jars.
6. **Weekly review**.
7. **Settings** — jar capacity, sounds/haptics, reminders & quiet hours, theme, export/import, (later) account & sync.
8. **Onboarding** — 3 screens max: concept of marbles → create first goal → first check-in drops the first marble immediately (instant win).

## 5. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **React + TypeScript + Vite** | Mature, fast dev loop, huge ecosystem. |
| Styling | Tailwind CSS | Fast iteration, consistent design tokens. |
| State | Zustand | Lightweight; DB is the source of truth. |
| Local storage | **IndexedDB via Dexie.js** (+ `useLiveQuery`) | Structured, large capacity, offline; Dexie has a sync path. |
| Physics | **Matter.js** (canvas) | Well-known 2D physics; enough for marbles in a jar. |
| Animation | Framer Motion (UI), canvas for jar | |
| PWA | `vite-plugin-pwa` (Workbox) | Installable, offline, service worker for notifications. |
| Sound | Howler.js or Web Audio | Short marble "clink" samples with slight pitch variation. |
| Dates | date-fns | Period/streak math, timezone-safe. |
| Testing | Vitest + Testing Library; Playwright for key flows | |

Performance target: jar physics at 60fps with 200 marbles on a mid-range phone. Settled marbles are put to sleep; sealed jars on the Shelf are rendered as static snapshots (no live physics).

## 6. Data model (sync-ready)

Design rules so cloud sync can be added later without migration pain:
- All IDs are **UUIDs** (client-generated).
- Every record has `createdAt`, `updatedAt`, `deletedAt?` (soft delete), and `deviceId`.
- Progress is stored as an **append-only event log** (`CheckIn`, `MarbleEvent`); totals are derived. This merges cleanly across devices.

```ts
type GoalType = 'habit' | 'project' | 'numeric';

interface Goal {
  id: string; type: GoalType; title: string; color: string;
  identity?: string;          // "I am someone who reads"
  intention?: string;         // "After morning coffee, at my desk"
  status: 'active' | 'paused' | 'completed' | 'archived';
  deadline?: string;          // ISO date
  // habit
  schedule?: { kind: 'daily' } | { kind: 'weekly'; timesPerWeek: number } | { kind: 'weekdays'; days: number[] };
  // numeric
  target?: { amount: number; unit: string; chunk: number };
  reminders?: { time: string; days?: number[] }[];
  createdAt: string; updatedAt: string; deletedAt?: string; deviceId: string;
}

interface Milestone { id: string; goalId: string; title: string; order: number; completedAt?: string; /* + meta */ }

interface CheckIn {          // a habit completion or numeric increment
  id: string; goalId: string; at: string; amount?: number;
  note?: string; mood?: 1 | 2 | 3 | 4 | 5; /* + meta */
}

interface MarbleEvent {      // append-only; source of truth for jars
  id: string; jarId: string; goalId?: string;
  reason: 'checkin' | 'chunk' | 'milestone' | 'streak' | 'goal_complete' | 'weekly_review' | 'starter';
  sourceId?: string;         // checkIn / milestone id (for undo)
  count: number; rarity: 'normal' | 'golden' | 'mythic';
  color: string; at: string; /* + meta */
}

interface Jar {
  id: string; capacity: number; label?: string;
  startedAt: string; sealedAt?: string;
  skin?: string;
  snapshot?: { x: number; y: number; angle: number; color: string; rarity: string }[]; // frozen layout for Shelf
  /* + meta */
}

interface StreakState { goalId: string; current: number; best: number; freezeTokens: number; lastPeriod: string; }
interface WeeklyReview { id: string; weekStart: string; wentWell?: string; inTheWay?: string; tweak?: string; /* + meta */ }
interface Unlock { id: string; kind: 'marble_skin' | 'jar_style' | 'shelf_bg'; key: string; unlockedAt: string; }
interface Settings { jarCapacity: number; sound: boolean; haptics: boolean; quietHours?: [string, string]; weeklyReviewDay: number; theme: 'system' | 'light' | 'dark'; }
```

**Undo:** un-checking a mistaken check-in soft-deletes the CheckIn and its MarbleEvents (`sourceId`). Allowed only within the current active jar.

## 7. Data ownership & future sync

- **v1:** 100% local (IndexedDB). No account, no network calls beyond loading the app.
- **Export/import:** full JSON backup (versioned schema), plus a reminder to export every 30 days, since browser storage can be cleared. Request `navigator.storage.persist()` on first run.
- **Later (opt-in):** account + cloud sync. Candidate approaches: Dexie Cloud, Supabase, or a custom sync endpoint consuming the event log. Last-write-wins on `updatedAt` for mutable records; union for append-only events. Server also enables real scheduled push notifications.
- **Later (social, out of scope v1):** share a jar snapshot image, accountability buddies, shared jars.

## 8. Scope

### v1 (MVP)
- Habits, projects w/ milestones, numeric targets
- Shared physics jar, effort-weighted marbles, full-jar ritual, Shelf
- Lenient streaks + freeze tokens
- Golden/rare marbles + basic cosmetic unlocks
- Check-in notes/mood, weekly review
- Local reminders (best effort), quiet hours
- PWA install + offline, export/import, light/dark theme

### Later
- Cloud sync + accounts, reliable push
- Social features
- Stats dashboard (trends, best days/times)
- Home-screen widget (needs native wrapper)
- More cosmetics, seasonal jars

### Non-goals
- Monetization, leaderboards, competitive features (these work against intrinsic motivation)
- Task manager / to-do list replacement

## 9. Open questions
- App name & visual identity.
- Exact marble values and jar capacity: tune after a week of self-use.
- Should paused goals keep their streaks frozen? (Proposed: yes.)
- Should rare-marble odds use a "pity timer" (guaranteed golden after N normal marbles)?
- Accessibility: reduced-motion mode replaces physics with a simple fill animation; sound-off by default in quiet hours.

## 10. Milestones (build order)
1. Project scaffold (Vite/React/TS/Tailwind/PWA), Dexie schema, export/import.
2. Goals CRUD for all three types + check-ins.
3. Marble engine (events, values, rarity) + jar physics view.
4. Full-jar ritual + Shelf.
5. Streaks + freeze tokens.
6. Notes/mood + weekly review.
7. Reminders, onboarding, cosmetics, polish (sound, haptics, reduced motion).
