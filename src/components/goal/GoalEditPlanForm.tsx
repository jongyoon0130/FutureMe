import { useMemo, useState } from 'react'
import type { GoalPlan } from '../../types/goalPlan'
import { parseIso } from '../../lib/goalCalendar'
import { getHorizonMeta } from '../../lib/goalHorizon'
import { rebuildPlanSchedule, resolveHorizon } from '../../lib/goalHierarchyEngine'
import { GoalNav } from './GoalShell'

interface Props {
  plan: GoalPlan
  onSave: (plan: GoalPlan) => void
  onCancel: () => void
}

export function GoalEditPlanForm({ plan, onSave, onCancel }: Props) {
  const h = plan.hierarchy!
  const [title, setTitle] = useState(plan.title)
  const [startDate, setStartDate] = useState(h.startDate)
  const [deadline, setDeadline] = useState(h.deadline)
  const [error, setError] = useState('')

  const meta = useMemo(() => getHorizonMeta(deadline, parseIso(startDate)), [deadline, startDate])
  const prevHorizon = resolveHorizon(h)
  const horizonChanged = prevHorizon !== meta.horizon

  const save = () => {
    const result = rebuildPlanSchedule(plan, { title, startDate, deadline })
    if ('error' in result) {
      setError(result.error)
      return
    }
    onSave(result)
  }

  return (
    <>
      <GoalNav tier="편집" tierClass="f" title="최종 목표" onBack={onCancel} />
      <div className="goal-scroll">
        <div className="goal-field">
          <label>최종 목표</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 앱개발" />
        </div>
        <div className="goal-field">
          <label>시작일</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="goal-field">
          <label>마감일</label>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <p className="goal-field-hint">{meta.hint}</p>
          <div className="goal-field-hint" style={{ marginTop: 6 }}>
            <div>· {meta.rangeLabel}</div>
            {meta.showMonthLayer ? <div>· 월 {meta.monthCount}칸</div> : null}
            {meta.showWeekLayer ? <div>· 주 W1–W{meta.weekCount}</div> : null}
            <div>· 일 {meta.dayCount}칸</div>
          </div>
        </div>
        {horizonChanged ? (
          <p className="goal-field-hint" style={{ color: 'var(--goal-warn, #b45309)', marginBottom: 12 }}>
            기간 변경으로 구조가 바뀝니다. 겹치는 월·주·날짜의 목표만 유지돼요.
          </p>
        ) : null}
        {error ? (
          <p className="goal-field-hint" style={{ color: 'var(--goal-warn, #b45309)', marginBottom: 12 }}>
            {error}
          </p>
        ) : null}
        <button type="button" className="goal-cta" onClick={save}>
          저장
        </button>
      </div>
    </>
  )
}
