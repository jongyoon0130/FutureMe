import { useEffect, useState } from 'react'
import {
  formatTaskTimeRange,
  parseTaskTime24,
  TASK_HOUR12_OPTIONS,
  TASK_MINUTE_OPTIONS,
  toTaskTime24,
  type TaskTimeField,
} from '../../lib/goalTaskTime'

interface Props {
  taskLabel: string
  timeStart?: string
  timeEnd?: string
  onSave: (next: { timeStart?: string; timeEnd?: string }) => void
  onClose: () => void
}

export function GoalTaskTimeSheet({ taskLabel, timeStart, timeEnd, onSave, onClose }: Props) {
  const [field, setField] = useState<TaskTimeField>('start')
  const [start, setStart] = useState<string | undefined>(() => timeStart)
  const [end, setEnd] = useState<string | undefined>(() => timeEnd)

  const active = field === 'start' ? start : end
  const parsed = parseTaskTime24(active ?? '09:00')
  const [period, setPeriod] = useState(parsed.period)
  const [hour12, setHour12] = useState(parsed.hour12)
  const [minute, setMinute] = useState(parsed.minute)

  useEffect(() => {
    const p = parseTaskTime24(active ?? '09:00')
    setPeriod(p.period)
    setHour12(p.hour12)
    setMinute(p.minute)
  }, [field, active])

  const applyPicker = (p: 'am' | 'pm', h: number, m: number) => {
    const value = toTaskTime24(p, h, m)
    if (field === 'start') setStart(value)
    else setEnd(value)
  }

  const clearField = () => {
    if (field === 'start') setStart(undefined)
    else setEnd(undefined)
  }

  const handleDone = () => {
    onSave({ timeStart: start, timeEnd: end })
  }

  const preview = formatTaskTimeRange(start, end)

  return (
    <div className="goal-time-backdrop" onClick={onClose} role="presentation">
      <div
        className="goal-time-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="할 일 시간 설정"
      >
        <h2 className="goal-time-title">할 일 시간</h2>
        <p className="goal-time-task">{taskLabel}</p>
        {preview ? <p className="goal-time-preview">{preview}</p> : <p className="goal-time-preview muted">시간 없음</p>}

        <div className="goal-time-field-tabs">
          <button
            type="button"
            className={field === 'start' ? 'on' : ''}
            onClick={() => setField('start')}
          >
            시작 {start ? start : '—'}
          </button>
          <button
            type="button"
            className={field === 'end' ? 'on' : ''}
            onClick={() => setField('end')}
          >
            끝 {end ? end : '—'}
          </button>
        </div>

        <div className="goal-time-ampm">
          <button
            type="button"
            className={period === 'am' ? 'on' : ''}
            onClick={() => {
              setPeriod('am')
              applyPicker('am', hour12, minute)
            }}
          >
            오전
          </button>
          <button
            type="button"
            className={period === 'pm' ? 'on' : ''}
            onClick={() => {
              setPeriod('pm')
              applyPicker('pm', hour12, minute)
            }}
          >
            오후
          </button>
        </div>

        <div className="goal-time-section">
          <span className="goal-time-section-label">시</span>
          <div className="goal-time-grid">
            {TASK_HOUR12_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                className={`goal-time-chip ${hour12 === h ? 'on' : ''}`}
                onClick={() => {
                  setHour12(h)
                  applyPicker(period, h, minute)
                }}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        <div className="goal-time-section">
          <span className="goal-time-section-label">분</span>
          <div className="goal-time-grid">
            {TASK_MINUTE_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={`goal-time-chip ${minute === m ? 'on' : ''}`}
                onClick={() => {
                  setMinute(m)
                  applyPicker(period, hour12, m)
                }}
              >
                {String(m).padStart(2, '0')}
              </button>
            ))}
          </div>
        </div>

        <div className="goal-time-actions">
          <button type="button" className="goal-time-clear" onClick={clearField}>
            {field === 'start' ? '시작 시간 비우기' : '끝 시간 비우기'}
          </button>
          <button type="button" className="goal-time-done" onClick={handleDone}>
            완료
          </button>
        </div>
      </div>
    </div>
  )
}
