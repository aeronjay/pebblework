import { BottomNav } from './app/BottomNav'
import { useRoute, type Route } from './app/router'
import { GoalDetailScreen } from './screens/GoalDetailScreen'
import { GoalFormScreen } from './screens/GoalFormScreen'
import { GoalsScreen } from './screens/GoalsScreen'
import { TodayScreen } from './screens/TodayScreen'

function Screen({ route }: { route: Route }) {
  switch (route.name) {
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
    default:
      return <p className="text-stone-500">Coming soon.</p>
  }
}

function App() {
  const route = useRoute()
  return (
    <div className="flex min-h-full flex-col">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pt-6 pb-8">
        <Screen route={route} />
      </main>
      <BottomNav route={route} />
    </div>
  )
}

export default App
