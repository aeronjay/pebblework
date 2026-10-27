import { href, type Route } from './router'

const TABS = [
  { label: 'Today', to: href.today, match: ['today'], icon: '◉' },
  { label: 'Goals', to: href.goals, match: ['goals', 'newGoal', 'goal', 'editGoal'], icon: '◎' },
  { label: 'Settings', to: href.settings, match: ['settings'], icon: '⚙' },
]

export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="sticky bottom-0 border-t border-stone-200 bg-stone-50/90 backdrop-blur dark:border-stone-800 dark:bg-stone-950/90">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = t.match.includes(route.name)
          return (
            <li key={t.label} className="flex-1">
              <a
                href={t.to}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? 'font-semibold text-stone-900 dark:text-stone-50' : 'text-stone-400'}`}
              >
                <span aria-hidden className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
