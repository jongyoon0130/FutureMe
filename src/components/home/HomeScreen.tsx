import { GoalApp } from '../goal/GoalApp'

interface Props {
  /** 하루 마감 → 미래의 나에게 이어 말하기 (채팅 프리필) */
  onTellFuture?: (prompt: string) => void
}

export function HomeScreen({ onTellFuture }: Props) {
  return (
    <div className="h-full overflow-hidden">
      <GoalApp embedded onTellFuture={onTellFuture} />
    </div>
  )
}
