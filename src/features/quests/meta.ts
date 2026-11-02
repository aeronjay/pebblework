import { Compass, Crown, Sunrise, type LucideIcon } from 'lucide-react'
import type { QuestCategory } from '../../db/types'

export { CATEGORY_ORDER } from './day'

export interface CategoryMeta {
  short: 'DQ' | 'MQ' | 'SQ'
  label: string
  blurb: string
  Icon: LucideIcon
  color: string // css var(), for inline styles / canvas lookups
  soft: string
  ink: string
}

// Tailwind classes for the same tokens: text-dq, bg-dq, bg-dq-soft, text-dq-ink (and mq/sq).
export const CATEGORY: Record<QuestCategory, CategoryMeta> = {
  dq: {
    short: 'DQ',
    label: 'Daily Quest',
    blurb: 'Rituals that reset every morning.',
    Icon: Sunrise,
    color: 'var(--color-dq)',
    soft: 'var(--color-dq-soft)',
    ink: 'var(--color-dq-ink)',
  },
  mq: {
    short: 'MQ',
    label: 'Main Quest',
    blurb: 'The big moves that shape the story.',
    Icon: Crown,
    color: 'var(--color-mq)',
    soft: 'var(--color-mq-soft)',
    ink: 'var(--color-mq-ink)',
  },
  sq: {
    short: 'SQ',
    label: 'Side Quest',
    blurb: 'Errands and detours, if time allows.',
    Icon: Compass,
    color: 'var(--color-sq)',
    soft: 'var(--color-sq-soft)',
    ink: 'var(--color-sq-ink)',
  },
}

// Resolves a token to a concrete color (e.g. for canvas drawing, which can't read var()).
export function resolveCategoryColor(category: QuestCategory, which: 'color' | 'soft' | 'ink' = 'color', el: Element = document.documentElement): string {
  const name = CATEGORY[category][which].slice(4, -1)
  return getComputedStyle(el).getPropertyValue(name).trim()
}
