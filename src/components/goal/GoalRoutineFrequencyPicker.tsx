import type { GoalCreationMode } from '../../lib/goalCreationConfig'
import { ROUTINE_SESSION_LABELS, ROUTINE_WEEKLY_QUICK } from '../../lib/goalCreationConfig'

interface Props {
  cadence: 'daily' | 'weekly'
  timesPerWeek: number
  sessionLength?: 'light' | 'moderate'
  onCadenceChange: (c: 'daily' | 'weekly') => void
  onTimesChange: (n: number) => void
  onSessionLengthChange: (s: 'light' | 'moderate') => void
}

export function GoalRoutineFrequencyPicker({
  cadence,
  timesPerWeek,
  sessionLength = 'moderate',
  onCadenceChange,
  onTimesChange,
  onSessionLengthChange,
}: Props) {
  const weeklyCount = cadence === 'daily' ? 7 : timesPerWeek

  return (
    <div className="goal-field">
      <label>습관 빈도 *</label>
      <div className="goal-cadence-tabs">
        <button
          type="button"
          className={`goal-cadence-tab ${cadence === 'daily' ? 'on' : ''}`}
          onClick={() => onCadenceChange('daily')}
        >
          매일
        </button>
        <button
          type="button"
          className={`goal-cadence-tab ${cadence === 'weekly' ? 'on' : ''}`}
          onClick={() => onCadenceChange('weekly')}
        >
          주간
        </button>
      </div>

      {cadence === 'daily' ? (
        <>
          <p className="goal-field-hint" style={{ marginTop: 8 }}>
            한 번에 얼마나 할 수 있어요?
          </p>
          <div className="goal-routine-freq-grid">
            {(Object.keys(ROUTINE_SESSION_LABELS) as Array<'light' | 'moderate'>).map((key) => (
              <button
                key={key}
                type="button"
                className={`goal-routine-freq-chip ${sessionLength === key ? 'on' : ''}`}
                onClick={() => onSessionLengthChange(key)}
              >
                {ROUTINE_SESSION_LABELS[key]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="goal-freq-stepper">
            <button
              type="button"
              className="goal-cal-nav"
              onClick={() => onTimesChange(Math.max(1, timesPerWeek - 1))}
              aria-label="횟수 줄이기"
            >
              −
            </button>
            <strong className="goal-freq-stepper-val">주 {weeklyCount}회</strong>
            <button
              type="button"
              className="goal-cal-nav"
              onClick={() => onTimesChange(Math.min(7, timesPerWeek + 1))}
              aria-label="횟수 늘리기"
            >
              +
            </button>
          </div>
          <div className="goal-routine-freq-grid" style={{ marginTop: 10 }}>
            {ROUTINE_WEEKLY_QUICK.map((n) => (
              <button
                key={n}
                type="button"
                className={`goal-routine-freq-chip compact ${timesPerWeek === n ? 'on' : ''}`}
                onClick={() => onTimesChange(n)}
              >
                {n}회
              </button>
            ))}
          </div>
        </>
      )}

      <p className="goal-field-hint">홈 달력에서 날짜별로 체크하면 주간 달성률이 쌓여요</p>
    </div>
  )
}

export function defaultRoutineCadence(_mode: GoalCreationMode): { cadence: 'daily' | 'weekly'; times: number } {
  return { cadence: 'weekly', times: 3 }
}
