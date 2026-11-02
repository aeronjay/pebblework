import { ArrowLeft, Compass } from 'lucide-react'
import { href } from '../../../app/router'
import { ui } from '../../../ui/styles'

const bar = 'rounded-full bg-sunken motion-safe:animate-pulse'

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading board" className="min-w-0">
      <div className={`h-6 w-20 ${bar}`} />
      <div className="mt-5 flex items-center gap-2">
        <div className={`h-6 w-24 ${bar}`} />
        <div className={`h-6 w-32 ${bar}`} />
      </div>
      <div className={`mt-4 h-9 w-[min(80%,420px)] rounded-[10px] bg-sunken motion-safe:animate-pulse`} />
      <div className="mt-8 flex gap-4 overflow-hidden">
        {[3, 2, 1].map((n, i) => (
          <div key={i} className="w-[min(84vw,316px)] shrink-0 rounded-[18px] border border-line bg-sunken/70 p-2 md:w-[300px]">
            <div className={`mx-1.5 my-3 h-3.5 w-24 ${bar}`} />
            <div className="flex flex-col gap-2">
              {Array.from({ length: n }, (_, j) => (
                <div key={j} className="h-[68px] rounded-[14px] border border-line bg-surface/70 motion-safe:animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BoardNotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-card border border-line bg-surface text-muted shadow-card">
          <Compass aria-hidden className="size-6" strokeWidth={1.5} />
        </span>
        <h1 className="mt-5 font-display text-[24px] leading-tight font-semibold tracking-tight text-ink">This board has wandered off</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          The project may have been deleted, or the link is out of date. Stones it earned are still safe in your jar.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <a href={href.projects} className={`${ui.btn} ${ui.primary} h-10 px-4 text-[14px]`}>
            <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
            All projects
          </a>
          <a href={href.home} className={`${ui.btn} ${ui.secondary} h-10 px-4 text-[14px]`}>
            Home
          </a>
        </div>
      </div>
    </div>
  )
}
