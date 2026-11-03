## 1. Vision & Motivation

A productivity tool where finishing tasks feels *physical*, not just a checkbox turning green. The core psychological trick: the two-jar habit method — start with an empty jar, and completed tasks drop "stones" into it. Watching the jar visibly fill up creates a tangible sense of accumulated progress that checklists alone don't give you.

---

## 2. Home Tab Layout Overview

Three-column layout:

```
┌────┬──────────────┬─────────────────────┐
│    │              │  📅 Quest Calendar  │
│Nav │  DQ / MQ / SQ├─────────────────────┤
│(≡) │  Quest Lists │  🫙 Reward Jar      │
│    │              │                     │
└────┴──────────────┴─────────────────────┘
```

- **Left — Nav rail:** Icon-only navigation between app sections (Home, and future tabs). **Collapses to a slim icon rail by default; expands to show labels on hover.** Not the quest lists — just page navigation.
- **Middle — Quest Lists:** The DQ / MQ / SQ categories live here, as the main content of the page. Clicking a category **filters/expands the task list beneath it**.
- **Right — Calendar + Jar:** Monthly calendar on top, reward jar below it.

---

## 3. Feature Breakdown

### 3.1 Middle Column — Quest Categories

| Category | Meaning | Suggested Use |
|---|---|---|
| **DQ — Daily Quest** | Recurring tasks reset every day | Habits, routines |
| **MQ — Main Quest** | Big, important, longer-term goals | Project milestones |
| **SQ — Side Quest** | Optional, low-stakes, nice-to-have | Errands, "if I have time" items |

**Functional requirements:**
- The middle column has a tab bar: **Today | All | Daily | Main | Side**. The chosen tab is remembered per device.
  - **Today** (default): only what today asks for, across all three categories (due today, done today, plus missed quests that can still be redone), each row tagged with its category. Quests already finished fold into an "N done today" line, so the list shrinks as the day goes; one ticked while the tab is open stays in place until you leave it.
  - **All**: the DQ / MQ / SQ section headers stacked, each expanding/collapsing its list in place (accordion-style). Main and side quests can be dragged between the stacked lists.
  - **Daily / Main / Side**: one category's full list, for reordering and managing. Drag a main or side quest onto the other one's tab to move it there.
  - Each tab shows a count (done/due today, else how many are open), on the same basis as the day's progress bar.
- Each quest item needs: title, category, completion status, optional due date/time.
- **Each category has its own distinct visual treatment** (color + icon), carried through consistently into the calendar and jar (see 3.3).

---

### 3.2 Quest Calendar (Monthly Grid)

**What it is:** A standard month-view calendar grid where each day cell reflects that day's task-completion status.

**Per-day cell states:**
1. **Empty/Future** — no tasks yet, or day hasn't arrived
2. **Pending** — has tasks, not all done yet
3. **Ready to claim** — all tasks for that day are done; visually marked, but not yet added to the jar
4. **Claimed** — reward already collected for that day

**"All tasks" claimable rule:** a day only becomes "ready to claim" once *all* quests assigned to it are completed. (Confirmed: all tasks, not partial.)

**Claim interaction — single global button:**
- There is **one "Claim" button** for the whole calendar (not one per day).
- Clicking it sweeps through every "ready to claim" day that hasn't been claimed yet and drops all of their stones into the jar in one animated batch — so if you skipped opening the app for 3 days, one click catches everything up at once.
- Guardrail: this only works because completion itself is locked to same-day (see 3.4) — the button is just collecting what was already honestly earned, it can't be used to backfill fake progress.

**Stone weight — GitHub-style intensity:**
- A completed task is still just "done" (binary) — but the **number/size of stones dropped for a day scales with how much was completed that day**, similar to GitHub's contribution graph shading (more activity = more intensity).
- Example: a day with 1 quest done drops a small/light stone; a day with 5 quests done drops a bigger stone or a small cluster. This rewards heavier days without punishing light ones.
- Stones are **color-coded by quest category** (DQ / MQ / SQ), so the jar visually tells the story of what kind of work you've been doing, not just how much.

**Retroactive claiming:** allowed via the batch button (catching up on unclaimed-but-earned days), but the *earning* itself is same-day only — see 3.4.

---

### 3.3 Reward Jar

**Behavior:**
- Starts empty.
- Each claim batch animates stones falling in from the calendar, colored by category, sized by that day's activity level.
- Stones settle with slight randomized position/rotation so the jar doesn't look mechanical.
- When the jar reaches capacity:
  - **Celebration animation** plays (confetti/glow + sound, see Section 5).
  - Jar empties and resets.

**Persistence:** Completing a jar **logs a permanent stat** (e.g. "Jars filled: 4") so a reset reads as a milestone, not a loss of progress.

**Capacity:** **Dynamic, based on quest load** — the jar's capacity scales with how many quests you actually have during that cycle, so a busier stretch doesn't make the jar unfairly slow (or a light stretch unfairly fast) to fill.

---

### 3.4 Anti-Gaming / Integrity Guardrails

**Soft guardrails (confirmed):**
- A quest can only be marked complete **on the day it's due** — you can't go back and retroactively mark yesterday's task as done today.
- The **claiming** of already-earned days can lag behind (that's what the single batch button is for), but the *completion* timestamp itself is locked to same-day.
- This keeps the jar honest while still being forgiving about when you actually open the app.
