import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { useToday } from '../../app/useToday'
import { getSettings } from '../../db/db'
import { useNow, usePlan } from '../plan/hooks'
import { isHandled, liveSlots, slotKey } from '../plan/model'
import { dayKey } from '../quests/day'
import { useQuestToday } from '../quests/hooks'
import { isDueToday } from '../quests/components/lists'
import { useTasks } from '../tasks/hooks'
import { cleanReminders, dueReminders, type ReminderSlot } from './model'
import { notify, readFired, writeFired } from './notify'

// Renders nothing. While the app is open (any screen, also in a background tab or the installed window), it shows
// the reminders that come due and keeps the app icon's badge at the number of quests today still asks for.
export function Reminders() {
  const settings = useLiveQuery(() => getSettings())
  const today = useQuestToday()
  const tasks = useTasks()
  const now = useNow()
  const todayKey = dayKey(useToday())
  const plan = usePlan(todayKey)
  const reminders = cleanReminders(settings?.reminders)

  const open = today ? today.items.filter((i) => isDueToday(i) && !i.done).map((i) => i.quest.title) : undefined
  const openCount = open?.length

  useEffect(() => {
    if (openCount === undefined) return
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    try {
      if (openCount > 0) void nav.setAppBadge?.(openCount)?.catch(() => {})
      else void nav.clearAppBadge?.()?.catch(() => {})
    } catch {
      // Badges are a nicety; not every browser has them.
    }
  }, [openCount])

  useEffect(() => {
    if (!reminders.enabled || !today || !plan || !open || today.todayKey !== todayKey) return
    const slots: ReminderSlot[] = liveSlots(plan.plan, today.items, tasks ?? []).map((s) => {
      const item = s.questId ? today.items.find((i) => i.quest.id === s.questId) : undefined
      const task = s.taskId ? tasks?.find((t) => t.id === s.taskId) : undefined
      return { key: slotKey(s), time: s.time, title: item?.quest.title ?? task?.title ?? '', ifThen: s.ifThen, done: item ? isHandled(item) : !!task?.completedAt }
    })
    const fired = readFired(todayKey)
    const due = dueReminders({ now, todayKey, settings: reminders, slots, open, tomorrowPlanned: !!plan.tomorrow && !plan.tomorrow.skipped, fired })
    if (!due.length) return
    // Marked first: a second tab running the same check a moment later finds them already taken.
    writeFired(todayKey, [...fired, ...due.map((r) => r.id)])
    for (const r of due) void notify(r)
  })

  return null
}
