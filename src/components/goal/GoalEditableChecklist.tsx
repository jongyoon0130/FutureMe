import type { PlanCheckItem } from '../../types/goalPlan'
import { GoalCheckRow } from './GoalShell'

const BLANK_ID = '__blank__'

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

interface Props {
  items: PlanCheckItem[]
  onToggle: (itemId: string) => void
  onLabelChange: (itemId: string, label: string) => void
  onAdd: () => void
  onRemove: (itemId: string) => void
  placeholder?: string
  className?: string
}

/** 드릴다운에서 목표 체크리스트 편집 (추가·수정·삭제) */
export function EditableChecklist({
  items,
  onToggle,
  onLabelChange,
  onAdd,
  onRemove,
  placeholder = '목표 항목',
  className,
}: Props) {
  const rows: PlanCheckItem[] = items.length ? items : [{ id: BLANK_ID, label: '', done: false }]

  return (
    <div className={className}>
      {rows.map((it) => (
        <div key={it.id} className={`goal-chk-row ${it.done ? 'done' : ''}`} style={{ alignItems: 'center' }}>
          <button
            type="button"
            className="goal-chk"
            onClick={() => it.id !== BLANK_ID && it.label.trim() && onToggle(it.id)}
            disabled={!it.label.trim()}
          >
            {it.done ? <CheckIcon /> : null}
          </button>
          <input
            type="text"
            className="goal-txt"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              outline: 'none',
              padding: 0,
              minWidth: 0,
            }}
            value={it.label}
            placeholder={placeholder}
            onChange={(e) => onLabelChange(it.id, e.target.value)}
          />
          {it.id !== BLANK_ID ? (
            <button
              type="button"
              className="goal-chk-remove"
              aria-label="삭제"
              onClick={() => onRemove(it.id)}
            >
              ×
            </button>
          ) : null}
        </div>
      ))}
      <button type="button" className="goal-add-line" onClick={onAdd}>
        + 항목 추가
      </button>
    </div>
  )
}

/** 읽기 전용 (홈 집계 등) */
export function ReadonlyChecklist({
  items,
  onToggle,
  goalName,
  onDrill,
}: {
  items: { id: string; label: string; done: boolean; planTitle?: string }[]
  onToggle: (id: string) => void
  goalName?: string
  onDrill?: () => void
}) {
  const visible = items.filter((i) => i.label.trim())
  if (!visible.length) return null
  return visible.map((it) => (
    <GoalCheckRow
      key={it.id}
      done={it.done}
      goalName={goalName ?? it.planTitle}
      text={it.label}
      onToggle={() => onToggle(it.id)}
      onDrill={onDrill}
    />
  ))
}
