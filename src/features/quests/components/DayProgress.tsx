import type { QuestToday } from '../hooks'
import { CATEGORY, CATEGORY_ORDER } from '../meta'

// Today at a glance: one sentence and one segment per quest the day asks for (finished ones take their stone's color).
// Same basis as the section counts: quests due today plus anything finished today.
export function DayProgress({ today }: { today: QuestToday }) {
  const day = today.items
    .filter((i) => i.when === 'today' || i.doneToday)
    .sort((a, b) => Number(b.done) - Number(a.done) || CATEGORY_ORDER.indexOf(a.quest.category) - CATEGORY_ORDER.indexOf(b.quest.category))
  const total = day.length
  const done = day.filter((i) => i.done).length

  let lead: string
  let rest = ''
  if (today.status === 'claimed') {
    lead = 'Today is claimed.'
    rest = 'Its stones are in your jar.'
  } else if (total === 0) {
    lead = 'Nothing due today.'
    rest = 'A good day for a side quest.'
  } else if (done === total) {
    lead = `All ${total} done.`
    rest = 'Claim today on the calendar to drop its stones.'
  } else {
    lead = `${done} of ${total} done today.`
    rest = total - done === 1 ? 'One to go.' : `${total - done} to go.`
  }

  return (
    <div>
      <p className="text-[15px] leading-snug">
        <span className="font-semibold text-ink">{lead}</span> <span className="text-muted">{rest}</span>
      </p>
      {total > 0 && (
        <div
          role="progressbar"
          aria-label="Today’s quests done"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="mt-3 flex h-2 max-w-[560px] gap-1"
        >
          {day.map((i) => (
            <span
              key={i.quest.id}
              className="h-full min-w-0 flex-1 rounded-chip bg-ink/10 transition-colors duration-300 ease-out-soft motion-reduce:transition-none"
              style={i.done ? { background: CATEGORY[i.quest.category].color } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
