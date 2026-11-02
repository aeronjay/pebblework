import { Gem, LoaderCircle, Sparkles } from 'lucide-react'
import type { Ref } from 'react'
import { claimCopy } from './model'

interface Props {
  days: number
  weight: number
  busy: boolean
  onClaim: () => void
  ref?: Ref<HTMLButtonElement>
}

export function ClaimButton({ days, weight, busy, onClaim, ref }: Props) {
  const copy = claimCopy(days, weight)
  const enabled = days > 0

  if (!enabled && !busy) {
    return (
      <button
        ref={ref}
        type="button"
        disabled
        className="flex h-11 w-full cursor-default items-center justify-between rounded-control border border-line bg-sunken/60 px-4 text-[13px] text-muted"
      >
        <span className="flex items-center gap-2 font-medium whitespace-nowrap">
          <Gem size={15} strokeWidth={1.75} className="text-faint" />
          {copy.label}
        </span>
        <span className="truncate text-[12px] text-faint max-[420px]:hidden">{copy.detail}</span>
      </button>
    )
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClaim}
      aria-label={busy ? 'Claiming' : copy.aria}
      aria-busy={busy}
      disabled={busy}
      className="qc-claim group block w-full rounded-control transition-opacity duration-150 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-0 active:scale-[.985] disabled:cursor-progress"
    >
      <span className="qc-claim-core flex h-11 items-center justify-between rounded-control bg-ink px-4 text-[14px] font-medium text-canvas">
        <span className="flex items-center gap-2">
          {busy ? (
            <LoaderCircle size={16} strokeWidth={2} className="qc-spin" />
          ) : (
            <Sparkles size={16} strokeWidth={1.75} className="transition-transform duration-240 ease-out-soft group-hover:rotate-12" />
          )}
          {busy ? 'Claiming…' : copy.label}
        </span>
        {!busy && (
          <span className="inline-flex items-center gap-1 rounded-chip bg-canvas/12 px-2 py-0.5 text-[12px] font-medium tabular-nums">
            <Gem size={12} strokeWidth={1.75} />
            {copy.detail}
          </span>
        )}
      </span>
    </button>
  )
}
