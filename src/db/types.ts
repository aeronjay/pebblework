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

export interface Jar extends Meta {
  id: string
  capacity: number
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
