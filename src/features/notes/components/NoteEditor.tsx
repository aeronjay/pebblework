import { ArrowLeft, Pin, PinOff, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Note } from '../../../db/types'
import { editedLabel, togglePin, updateNote, type NotePatch } from '../repo'

export interface ProjectOption {
  id: string
  title: string
}

interface Props {
  note: Note // render with key={note.id}: local state is seeded once per note
  projects: ProjectOption[]
  now: Date
  autoFocus: boolean
  onBack: () => void
  onDelete: (id: string) => void
}

const SAVE_DELAY = 400

const iconBtn =
  'inline-flex size-9 items-center justify-center rounded-control transition-colors hover:bg-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function NoteEditor({ note, projects, now, autoFocus, onBack, onDelete }: Props) {
  const id = note.id
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  // Debounced autosave. The pending patch belongs to this note only (the editor remounts per note), so a flush on
  // unmount after switching notes still writes to the right one.
  const pending = useRef<NotePatch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const patch = pending.current
    if (!patch) return
    pending.current = null
    void updateNote(id, patch)
  }, [id])

  function schedule(patch: NotePatch) {
    pending.current = { ...pending.current, ...patch }
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, SAVE_DELAY)
  }

  // Closing or hiding the tab doesn't unmount anything, so flush then too.
  useEffect(() => {
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus()
  }, [autoFocus])

  // Auto-grow the body (field-sizing isn't everywhere yet).
  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [body])

  // Save pending text first (IndexedDB runs these in order) so Undo restores the latest version.
  function remove() {
    flush()
    onDelete(id)
  }

  const linked = note.questId
  const missingProject = linked && !projects.some((p) => p.id === linked)
  const words = body.trim() ? body.trim().split(/\s+/).length : 0

  return (
    <article aria-label={title.trim() || 'Untitled note'} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2 md:px-4">
        <button type="button" onClick={onBack} className={`${iconBtn} text-muted hover:text-ink md:hidden`} aria-label="All notes">
          <ArrowLeft aria-hidden className="size-[18px]" />
        </button>
        <label className="ml-1 flex min-w-0 items-center gap-2 text-[13px] text-muted">
          <span className="sr-only sm:not-sr-only">Project</span>
          <select
            value={linked ?? ''}
            onChange={(e) => {
              flush()
              void updateNote(id, { questId: e.target.value || null })
            }}
            className="h-8 max-w-[11rem] min-w-0 truncate rounded-control border border-line-strong bg-surface px-2 text-[16px] md:text-[13px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[14rem]"
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
            {missingProject && <option value={linked}>Deleted project</option>}
          </select>
        </label>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void togglePin(id)}
            aria-pressed={!!note.pinned}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            title={note.pinned ? 'Unpin' : 'Pin to top'}
            className={`${iconBtn} ${note.pinned ? 'text-blaze-ink' : 'text-muted hover:text-ink'}`}
          >
            {note.pinned ? <PinOff aria-hidden className="size-[18px]" /> : <Pin aria-hidden className="size-[18px]" />}
          </button>
          <button type="button" onClick={remove} aria-label="Delete note" title="Delete" className={`${iconBtn} text-muted hover:text-danger-ink`}>
            <Trash2 aria-hidden className="size-[18px]" />
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-5 pb-6 md:px-8 md:pt-7">
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            schedule({ title: e.target.value })
          }}
          onBlur={flush}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              bodyRef.current?.focus()
            }
          }}
          placeholder="Title"
          aria-label="Title"
          maxLength={200}
          className="w-full rounded-control bg-transparent font-display text-[26px] leading-[1.15] font-normal tracking-[-0.015em] text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring md:text-[30px]"
        />
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            schedule({ body: e.target.value })
          }}
          onBlur={flush}
          placeholder="Jot down what’s on your mind, a plan, or what got in the way today."
          aria-label="Note"
          rows={6}
          className="-mx-3 mt-2 min-h-[12rem] w-[calc(100%+1.5rem)] flex-none resize-none overflow-hidden rounded-control bg-transparent px-3 py-2 text-[16px] leading-[1.6] text-ink outline-none placeholder:text-faint focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <p className="border-t border-line px-4 py-2 text-[12px] text-faint md:px-8">
        {editedLabel(note.updatedAt, now)}
        <span className="ml-3">{words === 1 ? '1 word' : `${words} words`}</span>
      </p>
    </article>
  )
}
