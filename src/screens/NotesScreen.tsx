import { NotebookPen, Plus, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { useProjects } from '../features/board/hooks'
import { NoteEditor, type ProjectOption } from '../features/notes/components/NoteEditor'
import { NoteList } from '../features/notes/components/NoteList'
import { useNotes } from '../features/notes/hooks'
import { createNote, deleteNote, matchesQuery, noteHeading, restoreNote } from '../features/notes/repo'
import { ui } from '../ui/styles'

const UNDO_MS = 6000

export function NotesScreen() {
  const notes = useNotes()
  const summaries = useProjects()
  const now = useMinuteClock()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [undo, setUndo] = useState<{ id: string; heading: string } | null>(null)

  const projects: ProjectOption[] = useMemo(
    () => (summaries ?? []).map((s) => ({ id: s.quest.id, title: s.quest.title })),
    [summaries],
  )
  const projectNames = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects])
  const visible = useMemo(() => (notes ?? []).filter((n) => matchesQuery(n, query)), [notes, query])
  const selected = notes?.find((n) => n.id === selectedId)

  async function newNote() {
    setQuery('')
    const id = await createNote()
    setSelectedId(id)
    setFocusId(id)
  }

  function select(id: string) {
    setSelectedId(id)
    setFocusId(null)
  }

  async function remove(id: string) {
    const note = notes?.find((n) => n.id === id)
    await deleteNote(id)
    if (selectedId === id) setSelectedId(null)
    setUndo({ id, heading: note ? noteHeading(note) : 'Note' })
  }

  async function undoDelete() {
    if (!undo) return
    await restoreNote(undo.id)
    setSelectedId(undo.id)
    setUndo(null)
  }

  // "N" starts a new note, unless the user is typing somewhere.
  const onNewNoteKey = useEffectEvent(() => void newNote())
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      e.preventDefault()
      onNewNoteKey()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!undo) return
    const t = setTimeout(() => setUndo(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [undo])

  const count = notes?.length ?? 0

  return (
    <div className="flex w-full flex-col">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 md:mb-8">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] leading-[1.05] font-normal tracking-[-0.02em] text-ink md:text-[42px]">Notes</h1>
          <p className="mt-2 text-[15px] text-muted">
            {notes === undefined ? ' ' : count === 0 ? 'Plans, thoughts and what got in the way.' : count === 1 ? '1 note' : `${count} notes`}
          </p>
        </div>
        <button type="button" onClick={() => void newNote()} aria-keyshortcuts="N" className={ui.cta}>
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          New note
          <kbd className={ui.ctaKbd}>N</kbd>
        </button>
      </header>

      {notes === undefined ? (
        <div aria-hidden className="h-[420px] animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none" />
      ) : count === 0 ? (
        <EmptyState onCreate={() => void newNote()} />
      ) : (
        <div className="flex flex-col md:grid md:h-[calc(100dvh-13rem)] md:min-h-[440px] md:grid-cols-[300px_minmax(0,1fr)] md:overflow-hidden md:rounded-card md:border md:border-line md:bg-surface lg:grid-cols-[320px_minmax(0,1fr)]">
          <section
            aria-label="All notes"
            className={`${selected ? 'hidden md:flex' : 'flex'} min-h-0 flex-col rounded-card border border-line bg-surface md:rounded-none md:border-0 md:border-r md:border-line`}
          >
            <div className="border-b border-line p-2">
              <label className="relative block">
                <span className="sr-only">Search notes</span>
                <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && query) {
                      e.preventDefault()
                      setQuery('')
                    }
                  }}
                  placeholder="Search notes"
                  className="h-9 w-full rounded-control border border-line bg-canvas pr-3 pl-9 text-[16px] text-ink md:text-[14px] outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
                />
              </label>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {visible.length ? (
                <NoteList notes={visible} selectedId={selectedId} projectNames={projectNames} now={now} onSelect={select} />
              ) : (
                <div className="px-4 py-8 text-center text-[14px] text-muted">
                  <p>No notes match “{query.trim()}”.</p>
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="mt-2 rounded-control px-2 py-1 font-semibold text-ink underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            aria-label="Editor"
            className={`${selected ? 'flex' : 'hidden md:flex'} min-h-[70dvh] min-w-0 flex-col rounded-card border border-line bg-surface md:min-h-0 md:rounded-none md:border-0`}
          >
            {selected ? (
              <NoteEditor
                key={selected.id}
                note={selected}
                projects={projects}
                now={now}
                autoFocus={focusId === selected.id}
                onBack={() => setSelectedId(null)}
                onDelete={(id) => void remove(id)}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-[15px] text-muted">Pick a note to read or edit it.</p>
                <p className="text-[13px] text-faint">
                  Or press <kbd className="rounded-[4px] border border-line-strong px-1.5 font-sans text-[12px]">N</kbd> to start a new one.
                </p>
              </div>
            )}
          </section>
        </div>
      )}

      <AnimatePresence>
        {undo && (
          <motion.div
            key={undo.id}
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-sm items-center gap-3 rounded-card border border-line bg-elevated py-2 pr-2 pl-4 text-[14px] text-ink shadow-pop md:bottom-8"
          >
            <span className="min-w-0 flex-1 truncate">Deleted “{undo.heading}”</span>
            <button
              type="button"
              onClick={() => void undoDelete()}
              className="rounded-control px-3 py-1.5 font-semibold text-ink hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndo(null)}
              aria-label="Dismiss"
              className="inline-flex size-8 items-center justify-center rounded-control text-muted hover:bg-sunken hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X aria-hidden className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 py-14 text-center md:py-20">
      <NotebookPen aria-hidden className="size-8 text-faint" strokeWidth={1.5} />
      <h2 className="mt-4 font-display text-[24px] leading-tight font-normal text-ink">Write your first note</h2>
      <p className="mt-2 max-w-[34ch] text-[15px] leading-relaxed text-muted">
        Jot down what’s on your mind, a plan, or what got in the way today. Naming it is half of moving past it.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-6 inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:bg-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        Start a note
      </button>
    </section>
  )
}

// Re-renders every 30s so "Edited 5 minutes ago" stays honest.
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}
