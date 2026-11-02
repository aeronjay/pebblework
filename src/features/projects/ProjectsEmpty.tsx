import { Plus } from 'lucide-react'
import { FlagIcon, HomeIcon, ProjectsIcon } from '../../app/icons/NavIcons'
import { ui } from '../../ui/styles'

const tile = 'absolute grid place-items-center rounded-[18px] border border-line bg-surface shadow-pop'

// Built from the nav icon set: a board flanked by a flag (the goal) and the jar (where stages' stones land).
function Illustration() {
  return (
    <div aria-hidden className="relative mx-auto h-[120px] w-[220px]">
      <span className="absolute inset-x-6 top-6 bottom-0 rounded-full bg-[radial-gradient(closest-side,var(--color-mq-soft),transparent)] blur-xl" />
      <span className={`${tile} top-7 left-2 size-[68px] -rotate-[9deg] text-sq-ink`} style={{ ['--nav-accent' as string]: 'var(--color-sq)' }}>
        <FlagIcon active className="size-8" />
      </span>
      <span className={`${tile} top-7 right-2 size-[68px] rotate-[9deg] text-dq-ink`} style={{ ['--nav-accent' as string]: 'var(--color-dq)' }}>
        <HomeIcon active className="size-8" />
      </span>
      <span className={`${tile} top-0 left-1/2 size-[88px] -translate-x-1/2 text-ink`}>
        <ProjectsIcon active className="size-11" />
      </span>
    </div>
  )
}

export function ProjectsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-line-strong bg-surface/50 px-6 pt-12 pb-12 text-center">
      <Illustration />
      <h2 className="mt-8 font-display text-[24px] font-medium text-ink">Start your first project</h2>
      <p className="mt-2 max-w-[42ch] text-[14px] leading-relaxed text-muted">
        Turn a big main or side quest into stages on a kanban board. Every stage you finish drops a stone in the jar.
      </p>
      <button
        type="button"
        onClick={onCreate}
        className={`mt-6 ${ui.quest}`}
      >
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        New project
      </button>
      <p className="mt-4 text-[12.5px] text-faint">For example: “Making a Game: Starfall”, with stages like “Add login/logout”.</p>
    </div>
  )
}
