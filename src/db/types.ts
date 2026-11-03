// Sync-ready records: client-generated UUIDs, timestamps, soft deletes, device id.
export interface Meta {
  createdAt: string
  updatedAt: string
  deletedAt?: string
  deviceId: string
}

export type GoalType = 'habit' | 'project' | 'numeric'
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived'

export type HabitSchedule =
  | { kind: 'daily' }
  | { kind: 'weekly'; timesPerWeek: number }
  | { kind: 'weekdays'; days: number[] } // 0 = Sunday

export interface NumericTarget {
  amount: number
  unit: string
  chunk: number // award a marble every `chunk` units
}

export interface Reminder {
  time: string // "HH:mm"
  days?: number[]
}

export interface Goal extends Meta {
  id: string
  type: GoalType
  title: string
  color: string
  identity?: string
  intention?: string
  status: GoalStatus
  deadline?: string
  schedule?: HabitSchedule
  target?: NumericTarget
  reminders?: Reminder[]
}

export interface Milestone extends Meta {
  id: string
  goalId: string
  title: string
  order: number
  completedAt?: string
}

export type Mood = 1 | 2 | 3 | 4 | 5

export interface CheckIn extends Meta {
  id: string
  goalId: string
  at: string
  amount?: number
  note?: string
  mood?: Mood
}

export type MarbleReason =
  | 'checkin'
  | 'chunk'
  | 'milestone'
  | 'streak'
  | 'goal_complete'
  | 'weekly_review'
  | 'starter'

export type Rarity = 'normal' | 'golden' | 'mythic'

// Append-only; the source of truth for jar contents.
export interface MarbleEvent extends Meta {
  id: string
  jarId: string
  goalId?: string
  reason: MarbleReason
  sourceId?: string
  count: number
  rarity: Rarity
  color: string
  at: string
}

export interface MarbleSnapshot {
  x: number
  y: number
  angle: number
  color: string
  rarity: Rarity
}

export type JarKind = 'goal' | 'quest'

export interface Jar extends Meta {
  id: string
  kind?: JarKind // undefined = 'goal' (pre-quest data)
  capacity: number // goal jars: marbles; quest jars: stone weight units, frozen once the first stone lands
  label?: string
  startedAt: string
  sealedAt?: string
  skin?: string
  snapshot?: MarbleSnapshot[]
}

export interface StreakState extends Meta {
  goalId: string
  current: number
  best: number
  freezeTokens: number
  lastPeriod: string
}

export interface WeeklyReview extends Meta {
  id: string
  weekStart: string
  wentWell?: string
  inTheWay?: string
  tweak?: string
}

export type UnlockKind = 'marble_skin' | 'jar_style' | 'shelf_bg'

export interface Unlock extends Meta {
  id: string
  kind: UnlockKind
  key: string
  unlockedAt: string
}

export interface Settings {
  id: 'settings'
  jarCapacity: number
  sound: boolean
  haptics: boolean
  quietHours?: [string, string]
  weeklyReviewDay: number
  theme: 'system' | 'light' | 'dark'
  lastExportAt?: string
}

export type QuestCategory = 'dq' | 'mq' | 'sq'

export interface Quest extends Meta {
  id: string
  category: QuestCategory
  title: string
  order: number
  startDate: string // dayKey; DQ active from this day. For MQ/SQ = creation day.
  dueDate?: string // dayKey; MQ/SQ only
  dueTime?: string // "HH:mm", optional, display only
  note?: string
  redoneAs?: string // set on a missed quest when "Do it today" copied it; the copy's id
  isProject?: boolean // MQ/SQ only: has a kanban board; never assigned to a day (dueDate = display-only deadline)
  projectDoneAt?: string // ISO, set by completeProject
  identityId?: string // the "who I'm becoming" statement this quest votes for; a missing/deleted identity = unlinked
  projectOrder?: number // projects only: manual position on the Projects grid (unset = auto, after ordered ones)
}

export type CompletionKind = 'quest' | 'card' | 'subtask' | 'project'

export interface QuestCompletion extends Meta {
  id: string // quest: `${questId}:${dayKey}`; card: `card:${cardId}`; subtask: `subtask:${cardId}:${subtaskId}`; project bonus: `project:${questId}`
  questId: string // for card/project completions: the project quest
  category: QuestCategory // denormalized so stones survive quest deletion
  dayKey: string
  completedAt: string
  kind?: CompletionKind // undefined = 'quest'
  cardId?: string // card and subtask completions only
  units?: number // stone weight units; default 1, project bonus 3
  claimedAt?: string // ISO; set by claimAll. A claimed completion is permanent (never withdrawn or un-completed).
  claimJarId?: string // quest jar that received the day's first stone in that claim
}

export interface BoardColumn extends Meta {
  id: string
  questId: string
  title: string
  order: number // the live column with the highest order is the "done" column
}

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Card extends Meta {
  id: string
  questId: string
  columnId: string
  title: string
  order: number // within its column
  note?: string
  dueDate?: string // dayKey; reminder only, never blocks a day
  subtasks: Subtask[]
  doneAt?: string // ISO when the card last entered the done column
}

// One row per day that has been claimed at least once. A day can be claimed again when completions land after a
// claim (only the new ones drop stones); completion.claimedAt is the source of truth for what's been claimed.
export interface DayClaim extends Meta {
  dayKey: string // primary key
  jarId: string // jar that received the day's first-ever stone
  claimedAt: string // latest claim of this day
  weight: number // Σ weight claimed for this day, over all claims
}

export interface Stone extends Meta {
  id: string
  jarId: string
  dayKey: string
  category: QuestCategory
  weight: 1 | 2 | 3
  rarity: Rarity
  at: string // ISO claim time, staggered 1ms per stone; order = (at, id) = drop order
}

// Free-form note. `questId` optionally links it to a project quest; the link survives the quest's deletion.
export interface Note extends Meta {
  id: string
  title: string
  body: string
  pinned?: boolean
  questId?: string
}

// "Who I'm becoming": an identity statement that quests and projects can be linked to (Quest.identityId).
export interface Identity extends Meta {
  id: string
  statement: string // e.g. "someone who moves every day"
  why?: string
  order: number
}
