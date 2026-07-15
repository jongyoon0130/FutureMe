import { GoalApp } from '../goal/GoalApp'

export function HomeScreen() {
  return (
    <div className="h-full overflow-hidden">
      <GoalApp embedded />
    </div>
  )
}
