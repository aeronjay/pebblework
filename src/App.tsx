import { MotionConfig } from 'motion/react'
import { BottomNav, SideNav } from './app/Nav'
import { useRoute, type Route } from './app/router'
import { useThemeSync } from './app/theme'
import { BoardScreen } from './screens/BoardScreen'
import { HomeScreen } from './screens/HomeScreen'
import { NotesScreen } from './screens/NotesScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'settings':
      return <SettingsScreen />
    case 'projects':
      return <ProjectsScreen />
    case 'board':
      return <BoardScreen id={route.id} />
    case 'notes':
      return <NotesScreen />
  }
}

// shell: Home lays itself out edge to edge (a no-scroll app shell on big screens). full: boards use the whole width
// (they scroll their columns sideways). roomy: the projects grid and notes. narrow: forms and lists.
type Layout = 'shell' | 'full' | 'roomy' | 'narrow'

const LAYOUT: Record<Layout, string> = {
  shell: 'w-full min-w-0 flex-1',
  full: 'w-full min-w-0 flex-1 px-4 pt-6 pb-10 md:px-8 md:pt-10 xl:px-12',
  roomy: 'mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 pt-6 pb-10 md:px-10 md:pt-10',
  narrow: 'mx-auto w-full max-w-md min-w-0 flex-1 px-4 pt-6 pb-8 md:max-w-4xl md:px-10 md:pt-10',
}

function layoutOf(route: Route): Layout {
  if (route.name === 'home') return 'shell'
  if (route.name === 'board') return 'full'
  if (route.name === 'projects' || route.name === 'notes') return 'roomy'
  return 'narrow'
}

function App() {
  const route = useRoute()
  useThemeSync()
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-full flex-col bg-canvas text-ink md:flex-row">
        <SideNav route={route} />
        <main className={LAYOUT[layoutOf(route)]}>
          <Screen route={route} />
        </main>
        <BottomNav route={route} />
      </div>
    </MotionConfig>
  )
}

export default App
