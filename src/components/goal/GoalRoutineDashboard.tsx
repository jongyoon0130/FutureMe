import type { GoalPlan } from '../../types/goalPlan'
import {
  getCurrentRoutineProgress,
  getRoutineFrequencyLabel,
  getRoutineWeekHistory,
  routineStreakWeeks,
} from '../../lib/goalRoutineEngine'
import { SecLabel } from './GoalShell'

interface Props {
  plan: GoalPlan
  onOpenWeek: (weekId: string) => void
  onOpenDay: (dayId: string, weekId: string) => void
}

export function GoalRoutineDashboard({ plan, onOpenWeek, onOpenDay }: Props) {
  const current = getCurrentRoutineProgress(plan)
  const history = getRoutineWeekHistory(plan, 5)
  const streak = routineStreakWeeks(plan)
  const freqLabel = getRoutineFrequencyLabel(plan)

  if (!current) {
    return <p className="goal-empty">루틴 기간을 불러올 수 없어요</p>
  }

  const remaining = Math.max(0, current.target - current.done)

  return (
    <>
      <div className="goal-routine-hero">
        <div className="goal-routine-hero-top">
          <span className="goal-routine-badge">{freqLabel}</span>
          {streak > 0 ? <span className="goal-routine-streak">🔥 {streak}주 연속 달성</span> : null}
        </div>
        <div className="goal-routine-progress-row">
          <div
            className="goal-ring goal-routine-ring"
            style={{
              background: `conic-gradient(var(--goal-warn) 0 ${current.pct}%, #eef1f5 ${current.pct}% 100%)`,
            }}
          >
            <i>
              {current.done}/{current.target}
            </i>
          </div>
          <div className="goal-routine-progress-copy">
            <strong>이번 주</strong>
            <span>
              {current.onTrack
                ? '목표 달성! 🎉'
                : remaining > 0
                  ? `${remaining}회 더 하면 이번 주 목표`
                  : '기록을 남겨 보세요'}
            </span>
            <button type="button" className="goal-routine-week-link" onClick={() => onOpenWeek(current.week.id)}>
              {current.week.label} · {current.week.dateLabel} ›
            </button>
          </div>
        </div>
        <div className="goal-routine-days">
          {current.days.map((d) => (
            <button
              key={d.dayId}
              type="button"
              className={[
                'goal-routine-day',
                d.done ? 'done' : '',
                d.isToday ? 'today' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onOpenDay(d.dayId, current.week.id)}
              title={`${d.dayOfWeek} ${d.dateLabel}`}
            >
              <span className="goal-routine-day-dow">{d.dayOfWeek.slice(0, 1)}</span>
              <span className="goal-routine-day-num">{d.dateLabel.split('/')[1]}</span>
            </button>
          ))}
        </div>
        <p className="goal-routine-hint">날짜를 탭하면 그날 체크리스트로 이동해요</p>
      </div>

      {history.length > 1 ? (
        <>
          <SecLabel>최근 주간 기록</SecLabel>
          <div className="goal-routine-history">
            {history.map((w) => (
              <button
                key={w.week.id}
                type="button"
                className="goal-routine-history-row"
                onClick={() => onOpenWeek(w.week.id)}
              >
                <span className="goal-routine-history-label">{w.week.label}</span>
                <div className="goal-routine-history-bar">
                  <i style={{ width: `${w.pct}%` }} />
                </div>
                <span className={`goal-routine-history-count ${w.onTrack ? 'ok' : ''}`}>
                  {w.done}/{w.target}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </>
  )
}
