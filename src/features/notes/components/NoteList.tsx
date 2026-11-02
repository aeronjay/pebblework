import { Pin } from 'lucide-react'
import type { Note } from '../../../db/types'
import { editedLabel, noteHeading, notePreview } from '../repo'

interface Props {
  notes: Note[]
  selectedId: string | null
  projectNames: Map<string, string>
  now: Date
  onSelect: (id: string) => void
}

export function NoteList({ notes, selectedId, projectNames, now, onSelect }: Props) {
  return (
    <ul className="flex flex-col gap-px p-2">
      {notes.map((note) => {
        const active = note.id === selectedId
        const preview = notePreview(note)
        const project = note.questId ? projectNames.get(note.questId) : undefined
        return (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => onSelect(note.id)}
              aria-current={active ? 'true' : undefined}
              className={`block w-full rounded-control px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active ? 'bg-blaze-soft' : 'hover:bg-elevated'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`min-w-0 flex-1 truncate text-[15px] font-semibold ${note.title.trim() || note.body.trim() ? 'text-ink' : 'text-faint'}`}>
                  {noteHeading(note)}
                </span>
                {note.pinned && <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-blaze-ink" />}
              </span>
              {preview && <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{preview}</span>}
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-faint">
                <span>{editedLabel(note.updatedAt, now)}</span>
                {project && (
                  <span className="max-w-full truncate rounded-chip bg-sunken px-2 py-px text-[11.5px] text-muted">{project}</span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
