import { MotionConfig } from 'motion/react'
import { BottomNav, SideNav } from './app/Nav'
import { useRoute, type Route } from './app/router'
import { useThemeSync } from './app/theme'
import { BoardScreen } from './screens/BoardScreen'
import { GoalDetailScreen } from './screens/GoalDetailScreen'
import { GoalFormScreen } from './screens/GoalFormScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { HomeScreen } from './screens/HomeScreen'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TodayScreen } from './screens/TodayScreen'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />
    case 'today':
      return <TodayScreen />
    case 'goals':
      return <GoalsScreen />
    case 'goal':
      return <GoalDetailScreen id={route.id} />
    case 'newGoal':
      return <GoalFormScreen />
    case 'editGoal':
      return <GoalFormScreen id={route.id} />
    case 'settings':
      return <SettingsScreen />
    case 'projects':
      return <ProjectsScreen />
    case 'board':
      return <BoardScreen id={route.id} />
  }
}

// full: Home and boards use the whole width (boards scroll their columns sideways).
// roomy: the projects grid. narrow: forms and lists.
type Layout = 'full' | 'roomy' | 'narrow'

const LAYOUT: Record<Layout, string> = {
  full: 'w-full min-w-0 flex-1 px-4 pt-6 pb-10 md:px-8 md:pt-10 xl:px-12',
  roomy: 'mx-auto w-full max-w-[1200px] min-w-0 flex-1 px-4 pt-6 pb-10 md:px-10 md:pt-10',
  narrow: 'mx-auto w-full max-w-md min-w-0 flex-1 px-4 pt-6 pb-8 md:max-w-4xl md:px-10 md:pt-10',
}

function layoutOf(route: Route): Layout {
  if (route.name === 'home' || route.name === 'board') return 'full'
  if (route.name === 'projects') return 'roomy'
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
