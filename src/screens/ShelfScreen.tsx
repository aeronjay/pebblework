import { format } from 'date-fns'
import { useLiveQuery } from 'dexie-react-hooks'
import { Pencil, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { href } from '../app/router'
import { useQuestJar } from '../features/quests/hooks'
import { PEBBLE } from '../features/quests/components/Pebble'
import { CATEGORY, CATEGORY_ORDER } from '../features/quests/meta'
import { parseDayKey } from '../features/quests/day'
import { JarFigure } from '../features/shelf/JarFigure'
import { loadShelf, renameJar, spanLabel, type ShelfJar } from '../features/shelf/model'

export function ShelfScreen() {
  const shelf = useLiveQuery(() => loadShelf())
  const live = useQuestJar()

  const filled = shelf?.filled ?? []
  // Stone weight, the jar's own unit (Home's jar counts "7 of 50" and its per-type chips the same way).
  const weight = filled.reduce((n, j) => n + j.weight, 0)
  const rare = filled.reduce((n, j) => n + j.rare, 0)
  const newestFirst = [...filled].reverse()

  return (
    <div>
      <header className="mb-8">
        <p className="text-[15px] font-semibold text-muted">
          {shelf === undefined ? ' ' : filled.length ? `${filled.length} ${filled.length === 1 ? 'jar' : 'jars'} filled · ${weight} quests’ worth of stones${rare ? ` · ${rare} rare` : ''}` : 'Filled jars'}
        </p>
        <h1 className="mt-1.5 font-display text-[34px] leading-[1.05] font-normal tracking-[-0.025em] text-ink md:text-[42px]">Shelf</h1>
        <p className="mt-2 max-w-[52ch] text-[14px] text-muted">Every jar you’ve filled, kept. Proof of the work, one stone at a time.</p>
      </header>

      {shelf === undefined ? (
        <div aria-hidden className="h-[300px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
      ) : (
        <ul className="grid grid-cols-2 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" aria-label="Jars">
          {shelf.current && live && (
            <li className="min-w-0">
              <ShelfItem item={shelf.current} capacity={live.capacity} current />
            </li>
          )}
          {!shelf.current && filled.length === 0 && (
            <li className="col-span-full">
              <Empty />
            </li>
          )}
          {newestFirst.map((j) => (
            <li key={j.jar.id} className="min-w-0">
              <ShelfItem item={j} capacity={Math.max(j.jar.capacity, j.weight)} />
            </li>
          ))}
          {shelf.current && filled.length === 0 && (
            <li className="col-span-1 flex min-w-0 flex-col justify-end sm:col-span-2 lg:col-span-3 xl:col-span-4">
              <div className="flex h-full flex-col items-center justify-center border-b-[3px] border-line-strong px-4 pb-6 text-center">
                <p className="max-w-[32ch] text-[14px] text-muted">When this jar fills up, it gets a lid and a spot here for good.</p>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

function ShelfItem({ item, capacity, current = false }: { item: ShelfJar; capacity: number; current?: boolean }) {
  const pct = Math.min(100, Math.round((item.weight / Math.max(1, capacity)) * 100))
  return (
    <article aria-label={current ? `${item.name}, filling now` : item.name} className="flex h-full flex-col">
      {/* The plank: each cell draws its own, and the grid has no column gap, so a row reads as one shelf. */}
      <div className="relative flex justify-center border-b-[3px] border-line-strong px-3 pt-2">
        <JarFigure jar={item} capacity={capacity} sealed={!current} className="h-[150px] w-[120px] md:h-[170px] md:w-[136px]" />
        {current && (
          <span className="absolute top-1 right-3 rounded-chip bg-sunken px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">Filling</span>
        )}
      </div>
      <div className="px-3 pt-3 text-center">
        <JarName item={item} editable={!current} />
        {current ? (
          <p className="mt-0.5 text-[12.5px] text-muted tabular-nums">
            {item.weight} of {capacity} · {pct}%
          </p>
        ) : (
          <p className="mt-0.5 text-[12.5px] text-muted">{item.filledOn ? `Filled ${format(parseDayKey(item.filledOn), 'MMM d, yyyy')}` : ''}</p>
        )}
        <p className="mt-0.5 text-[12px] text-faint">{spanLabel(item.firstDay, item.lastDay)}</p>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-2.5 gap-y-1" aria-label="Stone weight by quest type">
          {CATEGORY_ORDER.filter((c) => item.byCategory[c] > 0).map((c) => {
            const Icon = PEBBLE[c]
            return (
              <li key={c} className="inline-flex items-center gap-1 text-[12px] text-muted tabular-nums" aria-label={`${CATEGORY[c].label}: ${item.byCategory[c]}`}>
                <Icon aria-hidden size={14} />
                {item.byCategory[c]}
              </li>
            )
          })}
          {item.rare > 0 && (
            <li className="inline-flex items-center gap-1 text-[12px] text-muted tabular-nums" aria-label={`Rare stones: ${item.rare}`}>
              <Sparkles aria-hidden className="size-3.5 text-faint" strokeWidth={1.75} />
              {item.rare}
            </li>
          )}
        </ul>
      </div>
    </article>
  )
}

function JarName({ item, editable }: { item: ShelfJar; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.jar.label ?? '')
  const input = useRef<HTMLInputElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (editing) input.current?.select()
  }, [editing])

  if (!editable) return <h2 className="font-display text-[17px] leading-tight font-normal text-ink">{item.name}</h2>

  function done(save: boolean) {
    if (save) void renameJar(item.jar.id, draft)
    setEditing(false)
    requestAnimationFrame(() => button.current?.focus({ preventScroll: true }))
  }

  return editing ? (
    <input
      ref={input}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => done(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done(true)
        if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(item.jar.label ?? '')
          done(false)
        }
      }}
      maxLength={60}
      placeholder={`Jar ${item.number}`}
      aria-label="Jar name"
      className="w-full rounded-control border border-line-strong bg-surface px-2 py-0.5 text-center font-display text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  ) : (
    <h2>
      <button
        ref={button}
        type="button"
        onClick={() => {
          setDraft(item.jar.label ?? '')
          setEditing(true)
        }}
        title="Rename"
        className="group inline-flex max-w-full items-center gap-1.5 rounded-control px-1 font-display text-[17px] leading-tight font-normal text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{item.name}</span>
        <Pencil aria-hidden className="size-3 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
        <span className="sr-only">, rename</span>
      </button>
    </h2>
  )
}

function Empty() {
  return (
    <section className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-12 text-center">
      <JarFigure jar={null} capacity={1} sealed={false} className="h-[120px] w-[96px] opacity-80" />
      <h2 className="mt-4 font-display text-[22px] leading-tight font-normal text-ink">Your shelf is waiting</h2>
      <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed text-muted">
        Finish quests and claim your days to drop stones in your jar. Every jar you fill gets a lid and a place here.
      </p>
      <a
        href={href.home}
        className="mt-6 inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Go to today’s quests
      </a>
    </section>
  )
}
