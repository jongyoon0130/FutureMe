import { useEffect, useMemo, useRef, useState } from 'react'
import type { GoalPlan } from '../../types/goalPlan'
import type { DateSlots } from '../../lib/goalHierarchyEngine'
import { horizonShowsMonth, horizonShowsWeek } from '../../lib/goalHierarchyEngine'
import { addTierGoalAtDate } from '../../lib/goalHierarchyMutations'
import {
  MISC_PLAN_ID,
  MISC_PLAN_TITLE,
  addMiscTodo,
  type MiscTodoItem,
} from '../../lib/goalMiscTodos'

interface Props {
  tier: 'daily' | 'weekly' | 'monthly'
  date: Date
  goalOptions: { plan: GoalPlan; slots: DateSlots }[]
  profileId: string
  miscTodos: MiscTodoItem[]
  onMiscChange: (items: MiscTodoItem[]) => void
  placeholder?: string
  onGoalSave: (plan: GoalPlan) => void
  onCancel: () => void
}

type PickerOption = { id: string; label: string; kind: 'misc' | 'goal'; entry?: Props['goalOptions'][number] }

function goalOptionsForTier(goalOptions: Props['goalOptions'], tier: Props['tier']) {
  return goalOptions.filter(({ plan, slots }) => {
    const h = plan.hierarchy
    if (!h) return false
    if (tier === 'daily') return !!slots.dayId
    if (tier === 'weekly') return !!slots.weekId && horizonShowsWeek(h)
    return !!slots.monthId && horizonShowsMonth(h)
  })
}

export function GoalHomeTierAddRow({
  tier,
  date,
  goalOptions,
  profileId,
  miscTodos,
  onMiscChange,
  placeholder,
  onGoalSave,
  onCancel,
}: Props) {
  const eligibleGoals = useMemo(() => goalOptionsForTier(goalOptions, tier), [goalOptions, tier])
  const pickerOptions = useMemo<PickerOption[]>(
    () => [
      { id: MISC_PLAN_ID, label: MISC_PLAN_TITLE, kind: 'misc' },
      ...eligibleGoals.map(({ plan }) => ({
        id: plan.id,
        label: plan.title,
        kind: 'goal' as const,
        entry: eligibleGoals.find((e) => e.plan.id === plan.id),
      })),
    ],
    [eligibleGoals],
  )

  const [selectedId, setSelectedId] = useState(MISC_PLAN_ID)
  const [menuOpen, setMenuOpen] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const submitting = useRef(false)

  useEffect(() => {
    setSelectedId(MISC_PLAN_ID)
    setText('')
    setMenuOpen(false)
    inputRef.current?.focus()
  }, [tier, date])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const selected = pickerOptions.find((o) => o.id === selectedId) ?? pickerOptions[0]

  const submit = () => {
    const trimmed = text.trim()
    if (!trimmed || submitting.current) return
    submitting.current = true
    try {
      if (selected.kind === 'misc') {
        onMiscChange(addMiscTodo(profileId, miscTodos, tier, date, trimmed))
        setText('')
        onCancel()
        return
      }
      const entry = selected.entry
      if (!entry) return
      const next = addTierGoalAtDate(entry.plan, date, tier, trimmed)
      if (next) {
        onGoalSave(next)
        setText('')
        onCancel()
      }
    } finally {
      submitting.current = false
    }
  }

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    e.preventDefault()
    submit()
  }

  return (
    <div className="goal-tier-add">
      <div className="goal-tier-add-picker" ref={menuRef}>
        <button
          type="button"
          className="goal-tier-add-picker-btn"
          onClick={() => setMenuOpen((o) => !o)}
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
        >
          <span className="goal-tier-add-picker-label">{selected.label}</span>
          <span className="goal-tier-add-picker-chevron" aria-hidden>
            ▾
          </span>
        </button>
        {menuOpen ? (
          <div className="goal-tier-add-menu" role="listbox">
            {pickerOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={opt.id === selectedId}
                className={`goal-tier-add-menu-item ${opt.id === selectedId ? 'on' : ''}`}
                onClick={() => {
                  setSelectedId(opt.id)
                  setMenuOpen(false)
                  inputRef.current?.focus()
                }}
              >
                {opt.label}
                {opt.id === selectedId ? <span aria-hidden>✓</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="text"
        value={text}
        placeholder={placeholder ?? '할 일 입력'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleEnter}
      />
      <button type="button" className="goal-tier-add-btn" onClick={submit} disabled={!text.trim()}>
        추가
      </button>
      <button type="button" className="goal-tier-add-cancel" onClick={onCancel} aria-label="취소">
        ×
      </button>
    </div>
  )
}

/** 선택 날짜가 오늘인지 */
export function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
