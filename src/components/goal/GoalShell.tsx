import { useState, type ReactNode } from 'react'
import { GoalBatteryIcon } from './GoalBatteryIcon'
import { GoalSwipeDelete } from './GoalSwipeDelete'

export function GoalShell({ children, embedded = false }: { children: ReactNode; embedded?: boolean }) {
  if (embedded) {
    return <div className="goal-shell goal-shell-embedded">{children}</div>
  }
  return (
    <div className="goal-app">
      <div className="goal-shell">{children}</div>
    </div>
  )
}

type ScreenId = string

interface GoalStackProps {
  active: ScreenId
  stack: ScreenId[]
  screens: Record<ScreenId, ReactNode>
}

/** 프로토타입처럼 가로 슬라이드 스택 */
export function GoalStack({ active, stack, screens }: GoalStackProps) {
  const resolvedActive =
    screens[active] != null
      ? active
      : [...stack].reverse().find((id) => screens[id] != null) ?? Object.keys(screens)[0] ?? active
  const resolvedIdx = stack.indexOf(resolvedActive)

  return (
    <div className="goal-stack">
      {Object.entries(screens).map(([id, node]) => {
        const idx = stack.indexOf(id)
        const isActive = id === resolvedActive
        const isBehind = idx >= 0 && idx < resolvedIdx
        if (idx < 0 && !isActive) return null
        const cls = ['goal-screen', isActive ? 'active' : '', isBehind ? 'behind' : ''].filter(Boolean).join(' ')
        return (
          <div key={id} className={cls} aria-hidden={!isActive}>
            {node}
          </div>
        )
      })}
    </div>
  )
}

export function GoalNav({
  tier,
  tierClass,
  title,
  onBack,
  action,
}: {
  tier: string
  tierClass?: 'f' | 'm' | 'w' | 'd'
  title: string
  onBack?: () => void
  action?: { label: string; onClick: () => void; tone?: 'violet' | 'warn' }
}) {
  return (
    <div className="goal-nav">
      {onBack ? (
        <button type="button" className="goal-nav-back" onClick={onBack}>
          ‹
        </button>
      ) : null}
      <div className="goal-crumb" style={onBack ? undefined : { paddingLeft: 4 }}>
        <div className={`goal-crumb-lv ${tierClass ?? ''}`}>{tier}</div>
        <h1>{title}</h1>
      </div>
      {action ? (
        <button
          type="button"
          className={`goal-nav-btn ${action.tone ?? ''}`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}


export function MiniCalendar({
  year,
  month,
  selectedDay,
  onSelectDay,
  onMonthChange,
  onJumpToday,
  getDailyStats,
}: {
  year?: number
  month?: number
  selectedDay?: number | null
  onSelectDay?: (day: number) => void
  onMonthChange?: (year: number, month: number) => void
  onJumpToday?: () => void
  /** day → 일간 할 일 완료 stats (배터리 표시용) */
  getDailyStats?: (day: number) => { done: number; total: number; pct: number; inRange: boolean }
}) {
  const now = new Date()
  const y = year ?? now.getFullYear()
  const m = month ?? now.getMonth()
  const today = now.getDate()
  const isCurrentMonth = y === now.getFullYear() && m === now.getMonth()
  const jsFirst = new Date(y, m, 1).getDay()
  const leadingEmpty = jsFirst === 0 ? 6 : jsFirst - 1
  const dim = new Date(y, m + 1, 0).getDate()
  const dow = ['월', '화', '수', '목', '금', '토', '일'] as const
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(y)

  const shiftMonth = (delta: number) => {
    if (!onMonthChange) return
    const d = new Date(y, m + delta, 1, 12, 0, 0)
    onMonthChange(d.getFullYear(), d.getMonth())
  }

  const openPicker = () => {
    setPickerYear(y)
    setPickerOpen(true)
  }

  const pickMonth = (mo: number) => {
    onMonthChange?.(pickerYear, mo)
    setPickerOpen(false)
  }

  return (
    <div className="goal-mini-cal">
      <div className="goal-cal-head">
        {onMonthChange ? (
          <button type="button" className="goal-cal-nav" onClick={() => shiftMonth(-1)} aria-label="이전 달">
            ‹
          </button>
        ) : (
          <span className="goal-cal-nav-spacer" />
        )}
        {onMonthChange ? (
          <button type="button" className="goal-cal-title" onClick={openPicker}>
            {y}년 {m + 1}월
          </button>
        ) : (
          <strong className="goal-cal-title-static">{m + 1}월</strong>
        )}
        {onMonthChange ? (
          <button type="button" className="goal-cal-nav" onClick={() => shiftMonth(1)} aria-label="다음 달">
            ›
          </button>
        ) : (
          <span className="goal-cal-nav-spacer" />
        )}
      </div>
      {!isCurrentMonth && onJumpToday ? (
        <button type="button" className="goal-cal-today" onClick={onJumpToday}>
          오늘로
        </button>
      ) : null}
      <div className="goal-mini-grid">
        {dow.map((d, i) => (
          <div
            key={d}
            className={['goal-mc-dow', i === 5 ? 'sat' : '', i === 6 ? 'sun' : ''].filter(Boolean).join(' ')}
          >
            {d}
          </div>
        ))}
        {Array.from({ length: leadingEmpty }, (_, i) => (
          <div key={`e${i}`} className="goal-mc-empty" aria-hidden />
        ))}
        {Array.from({ length: dim }, (_, i) => {
          const day = i + 1
          const date = new Date(y, m, day, 12, 0, 0, 0)
          const dowIndex = date.getDay()
          const isSat = dowIndex === 6
          const isSun = dowIndex === 0
          const isToday = isCurrentMonth && day === today
          const isSelected = selectedDay === day
          const stats = getDailyStats?.(day)
          const hasTasks = (stats?.total ?? 0) > 0
          const inRange = stats?.inRange ?? false

          const cls = [
            'goal-mc-cell',
            isToday ? 'today' : '',
            isSelected ? 'selected' : '',
            isSat ? 'sat' : '',
            isSun ? 'sun' : '',
            !inRange ? 'out-range' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const inner = (
            <>
              <GoalBatteryIcon
                done={stats?.done}
                total={stats?.total}
                pct={stats?.pct}
                hasTasks={hasTasks}
                inRange={inRange}
              />
              <span className={`goal-mc-day ${isSelected ? 'selected-num' : isToday ? 'today-num' : ''}`}>{day}</span>
            </>
          )

          if (onSelectDay) {
            return (
              <button key={day} type="button" className={`${cls} goal-mc-btn`} onClick={() => onSelectDay(day)}>
                {inner}
              </button>
            )
          }
          return (
            <div key={day} className={cls}>
              {inner}
            </div>
          )
        })}
      </div>
      {pickerOpen ? (
        <div className="goal-cal-picker-backdrop" onClick={() => setPickerOpen(false)} role="presentation">
          <div className="goal-cal-picker" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="월 선택">
            <div className="goal-cal-picker-head">
              <button type="button" className="goal-cal-nav" onClick={() => setPickerYear((py) => py - 1)} aria-label="이전 해">
                ‹
              </button>
              <strong>{pickerYear}년</strong>
              <button type="button" className="goal-cal-nav" onClick={() => setPickerYear((py) => py + 1)} aria-label="다음 해">
                ›
              </button>
            </div>
            <div className="goal-cal-picker-grid">
              {Array.from({ length: 12 }, (_, i) => {
                const isNow = pickerYear === now.getFullYear() && i === now.getMonth()
                const isViewing = pickerYear === y && i === m
                return (
                  <button
                    key={i}
                    type="button"
                    className={['goal-cal-picker-month', isNow ? 'now' : '', isViewing ? 'active' : ''].filter(Boolean).join(' ')}
                    onClick={() => pickMonth(i)}
                  >
                    {i + 1}월
                  </button>
                )
              })}
            </div>
            <button type="button" className="goal-cal-picker-close" onClick={() => setPickerOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SecLabel({ children }: { children: ReactNode }) {
  return <div className="goal-sec-label">{children}</div>
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

export function GoalCheckRow({
  done,
  goalName,
  text,
  onToggle,
  onRemove,
  onDrill,
  onLabelChange,
}: {
  done: boolean
  goalName?: string
  text: string
  onToggle: () => void
  onRemove?: () => void
  onDrill?: () => void
  onLabelChange?: (label: string) => void
}) {
  const [editing, setEditing] = useState(false)

  const row = (
    <div className={`goal-chk-row ${done ? 'done' : ''}`}>
      <button
        type="button"
        className="goal-chk"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        {done ? <CheckIcon /> : null}
      </button>
      <div className="goal-chk-body" style={{ flex: 1, minWidth: 0 }}>
        {goalName ? <div className="goal-chk-goal">{goalName}</div> : null}
        {onLabelChange ? (
          editing ? (
            <input
              type="text"
              className="goal-txt goal-chk-input"
              value={text}
              autoFocus
              onChange={(e) => onLabelChange(e.target.value)}
              onBlur={() => setEditing(false)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              className="goal-chk-tap"
              onClick={() => setEditing(true)}
            >
              <span className="goal-txt">{text}</span>
            </button>
          )
        ) : (
          <span className="goal-txt">{text}</span>
        )}
      </div>
      {onDrill ? (
        <button
          type="button"
          className="goal-chk-drill"
          aria-label="상세 보기"
          onClick={(e) => {
            e.stopPropagation()
            onDrill()
          }}
        >
          ›
        </button>
      ) : null}
    </div>
  )

  if (onRemove) {
    return <GoalSwipeDelete onDelete={onRemove}>{row}</GoalSwipeDelete>
  }
  return row
}

export function GoalBranch({
  tone,
  icon,
  title,
  sub,
  pct,
  onClick,
}: {
  tone: 'g' | 'w' | 'd'
  icon: string
  title: string
  sub: string
  pct?: number
  onClick: () => void
}) {
  return (
    <button type="button" className={`goal-branch ${tone}`} onClick={onClick}>
      <div className="goal-branch-icon">{icon}</div>
      <div className="goal-branch-info">
        <strong>{title}</strong>
        <span>{sub}</span>
      </div>
      {pct !== undefined ? <span className="goal-branch-pct">{pct}%</span> : null}
      <span className="goal-chev">›</span>
    </button>
  )
}

export function GoalHero({
  tag,
  tagClass,
  title,
  sub,
  pct,
  progSub,
}: {
  tag: string
  tagClass: 'f' | 'm' | 'w' | 'd'
  title: string
  sub?: string
  pct?: number
  progSub?: string
}) {
  return (
    <div className="goal-hero">
      <div className={`goal-tag ${tagClass}`}>{tag}</div>
      <h2>{title}</h2>
      {sub ? <p>{sub}</p> : null}
      {pct !== undefined ? (
        <div className="goal-prog">
          <div
            className="goal-ring"
            style={{ background: `conic-gradient(var(--goal-accent) 0 ${pct}%, #eef1f5 ${pct}% 100%)` }}
          >
            <i>{pct}%</i>
          </div>
          <div>
            <strong style={{ fontSize: 13 }}>진행</strong>
            <br />
            <span style={{ fontSize: 12, color: 'var(--goal-muted)' }}>{progSub}</span>
          </div>
        </div>
      ) : null}
    </div>
  )
}
