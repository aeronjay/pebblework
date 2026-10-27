import { href, type Route } from './router'

const TABS = [
  { label: 'Today', to: href.today, match: ['today'], icon: '◉' },
  { label: 'Goals', to: href.goals, match: ['goals', 'newGoal', 'goal', 'editGoal'], icon: '◎' },
  { label: 'Settings', to: href.settings, match: ['settings'], icon: '⚙' },
]

// Bottom tab bar on phones.
export function BottomNav({ route }: { route: Route }) {
  return (
    <nav className="sticky bottom-0 border-t border-stone-200 bg-stone-50/90 backdrop-blur md:hidden dark:border-stone-800 dark:bg-stone-950/90">
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

// Sidebar on tablets and desktops.
export function SideNav({ route }: { route: Route }) {
  return (
    <nav className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-6 border-r border-stone-200 px-4 py-8 md:flex dark:border-stone-800">
      <a href={href.today} className="flex items-center gap-2 px-3 text-lg font-bold">
        <img src="/icon.svg" alt="" className="size-7 rounded-lg" />
        Marble Jar
      </a>
      <ul className="flex flex-col gap-1">
        {TABS.map((t) => {
          const active = t.match.includes(route.name)
          return (
            <li key={t.label}>
              <a
                href={t.to}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 ${active ? 'bg-stone-200 font-semibold dark:bg-stone-800' : 'text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-900'}`}
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
