import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import type { Jar, Quest, QuestCompletion, Stone } from '../../db/types'
import { useToday } from '../../app/useToday'
import { getActiveQuestJar, sealedQuestJarCount } from './claim'
import {
  canComplete,
  canUncomplete,
  claimableDays,
  dayKey,
  daySummary,
  isMissed,
  isQuestCompletion,
  isQuestDone,
  jarCapacityFor,
  monthDays,
  monthGrid,
  questWhen,
  sumUnits,
  unclaimed,
  type DaySummary,
  type MonthDay,
  type QuestWhen,
} from './day'
import { allQuests, claimedKeys, completionsBetween, liveCompletions, liveQuests } from './repo'

// Live (non-deleted) quests, sorted by category then order. undefined while loading.
export function useQuests(): Quest[] | undefined {
  return useLiveQuery(() => liveQuests())
}

// Live completions with fromKey <= dayKey <= toKey.
export function useCompletions(fromKey: string, toKey: string): QuestCompletion[] {
  return useLiveQuery(() => completionsBetween(fromKey, toKey), [fromKey, toKey]) ?? []
}

// Calendar grid (full weeks around `month`). [] while loading.
export function useMonth(month: Date, weekStartsOn: 0 | 1 = 0): MonthDay[] {
  const today = useToday()
  const grid = monthGrid(month, weekStartsOn)
  const from = dayKey(grid[0])
  const to = dayKey(grid[grid.length - 1])
  const monthKey = dayKey(month)
  const todayKey = dayKey(today)
  return (
    useLiveQuery(async () => {
      const [quests, completions, claimed] = await Promise.all([allQuests(), completionsBetween(from, to), claimedKeys()])
      return monthDays(month, quests, completions, claimed, today, weekStartsOn)
    }, [monthKey, from, to, todayKey, weekStartsOn]) ?? []
  )
}

// Claimable days (oldest first, incl. today again after new completions) and the stone weight the next claim adds
// (unclaimed completions only).
export function useClaimable(): { days: string[]; weight: number } {
  const today = useToday()
  const todayKey = dayKey(today)
  return (
    useLiveQuery(async () => {
      const [quests, completions, claimed] = await Promise.all([allQuests(), liveCompletions(), claimedKeys()])
      const days = claimableDays(quests, completions, claimed, today)
      const set = new Set(days)
      return { days, weight: sumUnits(unclaimed(completions).filter((c) => set.has(c.dayKey))) }
    }, [todayKey]) ?? { days: [], weight: 0 }
  )
}

export interface QuestJarState {
  jar: Jar | null // null until the first claim creates a quest jar
  stones: Stone[] // drop order
  weight: number // Σ stone weight
  capacity: number // frozen jar capacity once it has stones; otherwise live from current quest load
  fill: number // weight / capacity, clamped to [0, 1]
  jarsFilled: number // sealed quest jars
}

// undefined while loading. Read-only: never creates a jar.
export function useQuestJar(): QuestJarState | undefined {
  const today = useToday()
  const todayKey = dayKey(today)
  return useLiveQuery(async () => {
    const [jar, jarsFilled] = await Promise.all([getActiveQuestJar(), sealedQuestJarCount()])
    const stones = jar ? await db.stones.where('jarId').equals(jar.id).filter((s) => !s.deletedAt).toArray() : []
    stones.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    const weight = stones.reduce((n, s) => n + s.weight, 0)
    const capacity = jar && stones.length ? jar.capacity : jarCapacityFor(await allQuests(), today, await liveCompletions())
    return { jar: jar ?? null, stones, weight, capacity, fill: Math.min(1, weight / capacity), jarsFilled }
  }, [todayKey])
}

export interface QuestItem {
  quest: Quest
  when: QuestWhen
  done: boolean // DQ: done today; MQ/SQ: done at all; project: completeProject ran
  doneToday: boolean // the quest itself (never card/project completions)
  canComplete: boolean
  canUncomplete: boolean // done today and that completion isn't claimed yet
  missed: boolean // offer "Do it today" when missed && !quest.redoneAs
  claimed?: boolean // today's completion of the quest itself has been claimed (permanent)
}

export interface QuestToday extends DaySummary {
  todayKey: string
  claimed: boolean // today has been claimed at least once (it can be ready again; see `status`)
  items: QuestItem[] // every live quest, sorted by category then order
}

// Everything the quest lists need for today. undefined while loading.
export function useQuestToday(): QuestToday | undefined {
  const today = useToday()
  const todayKey = dayKey(today)
  return useLiveQuery(async () => {
    const [all, completions, claim] = await Promise.all([allQuests(), liveCompletions(), db.dayClaims.get(todayKey)])
    const claimed = !!claim
    const quests = await liveQuests()
    const byQuest = new Map<string, QuestCompletion[]>()
    for (const c of completions) if (isQuestCompletion(c)) byQuest.set(c.questId, [...(byQuest.get(c.questId) ?? []), c])
    const items = quests.map((quest): QuestItem => {
      const mine = byQuest.get(quest.id) ?? []
      const doneToday = mine.some((c) => c.dayKey === todayKey)
      const claimedToday = mine.some((c) => c.dayKey === todayKey && !!c.claimedAt)
      return {
        quest,
        when: questWhen(quest, mine, today),
        done: isQuestDone(quest, mine, today),
        doneToday,
        canComplete: canComplete(quest, mine, today),
        canUncomplete: canUncomplete(quest, mine, claimed, today),
        missed: isMissed(quest, mine, today),
        claimed: claimedToday,
      }
    })
    return { todayKey, claimed, items, ...daySummary(todayKey, all, completions, claimed, today) }
  }, [todayKey])
}
