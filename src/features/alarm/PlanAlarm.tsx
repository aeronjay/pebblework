import { useLiveQuery } from 'dexie-react-hooks'
import { AlarmClock, Play, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { href, navigate } from '../../app/router'
import { useToday } from '../../app/useToday'
import { getSettings } from '../../db/db'
import { useActiveSession } from '../focus/hooks'
import { DEFAULT_DURATION } from '../focus/model'
import { startSession } from '../focus/repo'
import { buzz, chime } from '../jar/feedback'
import { useNow, usePlan } from '../plan/hooks'
import { formatTime, isHandled, liveSlots, slotKey } from '../plan/model'
import { retimeSlot } from '../plan/repo'
import { dayKey } from '../quests/day'
import { useQuestToday } from '../quests/hooks'
import { useTasks } from '../tasks/hooks'
import { alarmId, dueAlarm, msUntilNext, RING_EVERY_MS, RINGS, SNOOZE_MIN, snoozeTime, type AlarmSlot } from './model'

const EASY_START_MIN = 5
const STORE = 'pebblework.alarm.answered'

// Alarms already answered today, shared across this browser's tabs.
function readAnswered(todayKey: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as { day?: string; ids?: string[] } | null
    return new Set(raw?.day === todayKey && Array.isArray(raw.ids) ? raw.ids : [])
  } catch {
    return new Set()
  }
}

function writeAnswered(todayKey: string, ids: Set<string>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ day: todayKey, ids: [...ids] }))
  } catch {
    // Private mode: it's remembered until the page reloads.
  }
}

const focus = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-elevated'

// Mounted once for the whole app: when a planned start time arrives, it rings and shows the alarm over whatever screen
// is open. Starting is one tap; putting it off moves the plan (and the alarm) ten minutes on.
export function PlanAlarm() {
  const reduce = useReducedMotion()
  const settings = useLiveQuery(() => getSettings())
  const today = useQuestToday()
  const tasks = useTasks()
  const session = useActiveSession()
  const todayKey = dayKey(useToday())
  const plan = usePlan(todayKey)
  const tick = useNow()
  const [exact, setExact] = useState(() => new Date())
  const [answered, setAnswered] = useState<{ day: string; ids: Set<string> }>(() => ({ day: todayKey, ids: readAnswered(todayKey) }))
  const [busy, setBusy] = useState(false)

  const enabled = settings?.planAlarm ?? true
  const ready = enabled && !!today && !!plan && today.todayKey === todayKey
  const slots: AlarmSlot[] = ready
    ? liveSlots(plan.plan, today.items, tasks ?? []).map((s) => {
        const item = s.questId ? today.items.find((i) => i.quest.id === s.questId) : undefined
        const task = s.taskId ? tasks?.find((t) => t.id === s.taskId) : undefined
        return { key: slotKey(s), time: s.time, title: item?.quest.title ?? task?.title ?? '', ifThen: s.ifThen, done: item ? isHandled(item) : !!task?.completedAt, questId: s.questId }
      })
    : []
  // `tick` refreshes every half minute; `exact` lands right on the next start time. The later of the two is now.
  const now = exact > tick ? exact : tick
  const known = answered.day === todayKey ? answered.ids : readAnswered(todayKey)
  const alarm = ready ? dueAlarm(slots, now, known, session?.questId) : undefined
  const id = alarm ? alarmId(alarm) : undefined

  // Wake up on the minute the next slot starts.
  const wait = ready ? msUntilNext(slots, now) : undefined
  useEffect(() => {
    if (wait === undefined) return
    const timer = setTimeout(() => setExact(new Date()), wait + 250)
    return () => clearTimeout(timer)
  }, [wait])

  // Ring a few times, then stay on screen quietly: an alarm that never stops gets muted for good.
  const sound = settings?.sound ?? true
  const haptics = settings?.haptics ?? true
  const title = alarm ? `${formatTime(alarm.time)} · ${alarm.title}` : undefined
  useEffect(() => {
    if (!id) return
    let rings = 0
    const ring = () => {
      rings += 1
      if (sound) chime()
      if (haptics) buzz(180)
    }
    ring()
    const timer = setInterval(() => (rings >= RINGS ? clearInterval(timer) : ring()), RING_EVERY_MS)
    const before = document.title
    document.title = `⏰ ${title}`
    return () => {
      clearInterval(timer)
      document.title = before
    }
  }, [id, sound, haptics, title])

  function answer() {
    if (!id) return
    const ids = new Set([...readAnswered(todayKey), id])
    writeAnswered(todayKey, ids)
    setAnswered({ day: todayKey, ids })
  }

  async function start(minutes: number) {
    if (!alarm || busy) return
    setBusy(true)
    try {
      await startSession({ task: alarm.title, plannedMin: minutes, questId: alarm.questId })
      answer()
      navigate(href.focus)
    } finally {
      setBusy(false)
    }
  }

  // Moves the slot itself, so the plan stays true and the alarm comes back at the new time.
  async function later() {
    if (!alarm || busy) return
    const time = snoozeTime(new Date())
    setBusy(true)
    try {
      if (time) await retimeSlot(todayKey, alarm.key, time)
      answer()
    } finally {
      setBusy(false)
    }
  }

  const canSnooze = !!snoozeTime(now)

  return (
    <AnimatePresence>
      {alarm && (
        <motion.div
          key={id}
          role="alertdialog"
          aria-labelledby="plan-alarm-title"
          aria-describedby="plan-alarm-body"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, transition: { duration: 0.15 } }}
          transition={reduce ? { duration: 0 } : { type: 'spring', bounce: 0.25, duration: 0.5 }}
          onKeyDown={(e) => e.key === 'Escape' && answer()}
          className="fixed inset-x-3 top-3 z-[70] mx-auto max-w-[460px] rounded-card border border-line-strong bg-elevated p-4 shadow-pop sm:top-5 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-blaze-soft text-blaze-ink motion-safe:animate-pulse">
              <AlarmClock className="size-[18px]" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-muted">It’s time · you planned this for {formatTime(alarm.time)}</p>
              <h2 id="plan-alarm-title" className="mt-0.5 font-display text-[22px] leading-[1.15] font-normal break-words text-ink">
                {alarm.title}
              </h2>
              <p id="plan-alarm-body" className="mt-1 text-[13px] leading-relaxed text-muted">
                {alarm.ifThen ? `If it slips, you said you’ll ${alarm.ifThen}` : 'Starting is the hard part. Five minutes counts.'}
              </p>
            </div>
            <button type="button" onClick={answer} aria-label="Dismiss alarm" className={`grid size-8 shrink-0 place-items-center rounded-full text-faint transition hover:bg-sunken hover:text-ink ${focus}`}>
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void start(DEFAULT_DURATION)}
              className={`inline-flex items-center gap-2 rounded-control bg-blaze py-2 pr-3.5 pl-3 text-[14px] font-semibold text-on-blaze transition-[filter] hover:brightness-[1.06] disabled:opacity-60 ${focus}`}
            >
              <Play aria-hidden className="size-4" strokeWidth={2.25} fill="currentColor" />
              Start, {DEFAULT_DURATION} min
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void start(EASY_START_MIN)}
              className={`rounded-control border border-line-strong bg-surface px-3 py-2 text-[14px] font-semibold text-ink transition hover:bg-sunken disabled:opacity-60 ${focus}`}
            >
              Just {EASY_START_MIN} min
            </button>
            {canSnooze && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void later()}
                title={`Moves it in your plan to ${SNOOZE_MIN} minutes from now, and rings again then.`}
                className={`ml-auto rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-muted transition hover:bg-sunken hover:text-ink ${focus}`}
              >
                In {SNOOZE_MIN} min
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
