// After a quest row is deleted, focus should land somewhere sensible instead of falling to <body> when the row
// (or the sheet's opener inside it) leaves the DOM: the next row, else the previous one, else the section header.
// Resolve it while the row is still attached.
export function neighborOfRow(from: Element | null | undefined): HTMLElement | null {
  if (!from) return null
  const li = from.closest('li')
  const section = from.closest('section')
  const firstButton = (el: Element | null | undefined) => el?.querySelector<HTMLElement>('a[href],button:not([disabled])') ?? null
  return firstButton(li?.nextElementSibling) ?? firstButton(li?.previousElementSibling) ?? section?.querySelector<HTMLElement>('h2 button') ?? null
}
