import { Play, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useInProgress } from '../../board/hooks'
import { isProject } from '../../quests/day'
import { useQuestToday } from '../../quests/hooks'
import { CATEGORY } from '../../quests/meta'
import { DEFAULT_DURATION, DURATIONS } from '../model'
import { startSession } from '../repo'

interface Suggestion {
  key: string
  title: string
  where: string // the project, or the quest type
  questId: string
  cardId?: string
  category?: keyof typeof CATEGORY
}

const SHOWN = 6

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

// The composer: one field for the one thing (typed, or picked from your own work so it can be marked done after),
// a length, and Start.
export function FocusSetup() {
  const cards = useInProgress()
  const today = useQuestToday()
  const [task, setTask] = useState('')
  const [linked, setLinked] = useState<Suggestion | null>(null)
  const [minutes, setMinutes] = useState<number>(DEFAULT_DURATION)
  const [more, setMore] = useState(false)
  const [nudge, setNudge] = useState(false)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const hintId = useId()

  const suggestions: Suggestion[] = [
    ...(cards ?? []).map((c) => ({ key: `card:${c.card.id}`, title: c.card.title, where: c.quest.title, questId: c.quest.id, cardId: c.card.id })),
    ...(today?.items ?? [])
      .filter((i) => !i.done && i.canComplete && !isProject(i.quest) && (i.when === 'today' || i.when === 'anytime'))
      .map((i) => ({ key: `quest:${i.quest.id}`, title: i.quest.title, where: CATEGORY[i.quest.category].label, questId: i.quest.id, category: i.quest.category })),
  ]
  const shown = more ? suggestions : suggestions.slice(0, SHOWN)

  function pick(s: Suggestion) {
    if (linked?.key === s.key) {
      setLinked(null)
      setTask('')
      return
    }
    setLinked(s)
    setTask(s.title)
    setNudge(false)
  }

  async function start() {
    const name = task.trim()
    if (!name) {
      setNudge(true)
      input.current?.focus()
      return
    }
    setBusy(true)
    try {
      await startSession({ task: name, plannedMin: minutes, questId: linked?.questId, cardId: linked?.cardId })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="Start a focus session" className="rounded-card border border-line bg-surface">
      <div className="px-5 pt-5 md:px-7 md:pt-7">
        <label htmlFor={inputId} className="text-[15px] font-semibold text-ink">
          What will you focus on?
        </label>
        <input
          ref={input}
          id={inputId}
          value={task}
          onChange={(e) => {
            setTask(e.target.value)
            setNudge(false)
            // Typing over a picked task makes it a different task: drop the link.
            if (linked && e.target.value.trim() !== linked.title) setLinked(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void start()
          }}
          aria-describedby={hintId}
          aria-invalid={nudge || undefined}
          placeholder="e.g. draft the intro"
          autoComplete="off"
          className={`mt-2 w-full border-b-2 bg-transparent pb-2 font-display text-[24px] leading-tight text-ink outline-none transition-colors placeholder:text-faint/70 md:text-[30px] ${
            nudge ? 'border-blaze' : 'border-line-strong focus:border-ring'
          }`}
        />
        <p id={hintId} aria-live="polite" className={`mt-2 min-h-[20px] text-[13px] ${nudge ? 'text-blaze-ink' : 'text-muted'}`}>
          {nudge ? (
            'Name the one thing first.'
          ) : linked ? (
            <span className="inline-flex items-center gap-1.5">
              Linked to {linked.cardId ? `the ${linked.where} board` : `your ${linked.where.toLowerCase()}`}, so you can mark it done after.
              <button
                type="button"
                onClick={() => setLinked(null)}
                aria-label="Unlink"
                className={`grid size-5 place-items-center rounded-chip text-faint hover:bg-sunken hover:text-ink ${focusRing}`}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </span>
          ) : (
            'Switching tasks costs more than it feels like. Pick just one.'
          )}
        </p>

        {suggestions.length > 0 && (
          <div className="mt-3">
            <p className="mb-2 text-[13px] font-medium text-muted">From your work</p>
            <ul className="flex flex-wrap gap-1.5">
              {shown.map((s) => {
                const on = linked?.key === s.key
                const Icon = s.category ? CATEGORY[s.category].Icon : null
                return (
                  <li key={s.key} className="min-w-0 max-w-full">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => pick(s)}
                      title={s.where}
                      className={`flex max-w-full items-center gap-1.5 rounded-chip border py-1.5 pr-3 pl-2.5 text-[13.5px] transition-colors ${focusRing} ${
                        on ? 'border-ink bg-ink font-semibold text-canvas' : 'border-line bg-canvas text-ink hover:border-line-strong'
                      }`}
                    >
                      {Icon ? <Icon size={14} /> : <span aria-hidden className={`size-1.5 shrink-0 rounded-chip ${on ? 'bg-canvas' : 'bg-ring'}`} />}
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                )
              })}
              {suggestions.length > SHOWN && (
                <li>
                  <button type="button" onClick={() => setMore((m) => !m)} className={`rounded-chip px-2.5 py-1.5 text-[13.5px] font-medium text-muted hover:text-ink ${focusRing}`}>
                    {more ? 'Fewer' : `${suggestions.length - SHOWN} more`}
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-7">
        <div>
          <div role="radiogroup" aria-label="Length" className="flex gap-1 rounded-control bg-sunken p-1">
            {DURATIONS.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={minutes === d}
                onClick={() => setMinutes(d)}
                className={`flex-1 rounded-[5px] px-3 py-1.5 text-[13.5px] whitespace-nowrap transition sm:flex-none ${focusRing} ${
                  minutes === d ? 'bg-surface font-semibold text-ink shadow-card ring-1 ring-line' : 'text-muted hover:text-ink'
                }`}
              >
                {d ? `${d} min` : 'No limit'}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12.5px] text-faint">Dreading it? Pick 15. You can keep going when time’s up.</p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-control bg-blaze px-5 py-3 text-[15px] font-semibold text-on-blaze transition-[filter] outline-none hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:brightness-95"
        >
          <Play aria-hidden className="size-4 fill-current" strokeWidth={2.25} />
          {minutes ? `Start ${minutes} minutes` : 'Start focusing'}
        </button>
      </div>
    </section>
  )
}
