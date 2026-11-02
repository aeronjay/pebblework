import { useMemo, useState } from 'react'
import { useProjects } from '../../board/hooks'
import type { QuestCategory } from '../../../db/types'
import type { QuestItem, QuestToday } from '../hooks'
import { CATEGORY_ORDER } from '../meta'
import { QuestSection } from './QuestSection'

const OPEN_KEY = 'quests:open-sections'

function readOpen(): Record<QuestCategory, boolean> {
  const all = { dq: true, mq: true, sq: true }
  try {
    const raw = localStorage.getItem(OPEN_KEY)
    return raw ? { ...all, ...JSON.parse(raw) } : all
  } catch {
    return all
  }
}

interface Props {
  today: QuestToday
  onAdd: (category: QuestCategory) => void
  onEdit: (item: QuestItem) => void
}

// The DQ / MQ / SQ accordions. Any number can be open; the choice is remembered per device.
export function QuestLists({ today, onAdd, onEdit }: Props) {
  const [open, setOpen] = useState(readOpen)
  const summaries = useProjects()
  const projects = useMemo(() => (summaries ? new Map(summaries.map((p) => [p.quest.id, p])) : undefined), [summaries])

  function toggle(c: QuestCategory) {
    setOpen((prev) => {
      const next = { ...prev, [c]: !prev[c] }
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next))
      } catch {
        // Private mode etc.: still works for this session.
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {CATEGORY_ORDER.map((c) => (
        <QuestSection
          key={c}
          category={c}
          items={today.items.filter((i) => i.quest.category === c)}
          todayKey={today.todayKey}
          claimed={today.claimed}
          open={open[c]}
          onToggle={() => toggle(c)}
          onAdd={() => onAdd(c)}
          onEdit={onEdit}
          projects={projects}
        />
      ))}
    </div>
  )
}
