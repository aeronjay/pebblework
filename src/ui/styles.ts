// Shared class strings, built on the design tokens in index.css (theme-aware, no dark: variants needed).
export const ui = {
  input:
    'w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-ink outline-none transition placeholder:text-faint focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
  label: 'mb-1 block text-sm font-medium text-muted',
  hint: 'mt-1 text-xs text-faint',
  btn: 'inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 font-medium transition active:scale-[.98] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  primary: 'bg-ink text-canvas shadow-card hover:opacity-90',
  secondary: 'border border-line bg-surface text-ink shadow-card hover:bg-sunken',
  danger: 'bg-danger-soft text-danger-ink hover:brightness-95',
  card: 'rounded-card border border-line bg-surface p-4 shadow-card',
  h1: 'font-display text-2xl font-semibold',
  // The one main action per screen ("New quest", "New project"): solid ink, quiet everywhere else.
  cta: 'inline-flex items-center gap-2 rounded-control bg-ink py-2.5 pr-3 pl-3.5 text-[14px] font-medium text-canvas transition-opacity hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  ctaKbd: 'ml-1 hidden rounded-[4px] border border-canvas/25 px-1.5 font-sans text-[11px] text-canvas/70 md:inline',
}

export function seg(active: boolean) {
  return `flex-1 rounded-lg px-3 py-1.5 text-sm transition ${active ? 'bg-surface font-semibold text-ink shadow-card' : 'text-muted hover:text-ink'}`
}
export const segGroup = 'flex gap-1 rounded-control bg-sunken p-1'
