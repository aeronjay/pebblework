import { Plus } from 'lucide-react'
import { ui } from '../../ui/styles'

// A cairn: a project is stones stacked one stage at a time. Main at the base, side, then daily on top.
function Illustration() {
  return (
    <svg aria-hidden viewBox="0 0 120 96" className="mx-auto h-[96px] w-[120px]">
      <path d="M14 86h92" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" />
      <path d="M22 72c-1-9 12-15 35-16 24-1 41 4 42 13 1 10-16 16-39 16S23 81 22 72z" fill="var(--color-mq)" />
      <path d="M35 48c-.5-6.5 9.5-11 23-11.4 14-.4 26 3 26.4 9.6.4 7-10 11.3-24.5 11.7C45.5 58.3 35.5 54.6 35 48z" fill="var(--color-sq)" />
      <path d="M47 26.5c0-5.4 6-9 13.5-9S74 21 74 26.4c0 5.6-6.2 9-13.8 9-7.5 0-13.2-3.4-13.2-8.9z" fill="var(--color-dq)" />
      <path d="M53 23.5c1.6-2.2 4.4-3.5 7.6-3.6M42 45c2.6-2.5 7-4 12-4.4M32 67c4-3 11-5 19-5.6" fill="none" stroke="white" strokeOpacity=".45" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

export function ProjectsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong px-6 pt-12 pb-12 text-center">
      <Illustration />
      <h2 className="mt-8 font-display text-[24px] font-medium text-ink">Start your first project</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
        Turn a big main or side quest into stages on a kanban board. Every stage you finish drops a stone in the jar.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className={`mt-6 ${ui.cta}`}
      >
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        New project
      </button>
      <p className="mt-4 text-[12.5px] text-faint">For example: “Making a Game: Starfall”, with stages like “Add login/logout”.</p>
    </div>
  )
}
