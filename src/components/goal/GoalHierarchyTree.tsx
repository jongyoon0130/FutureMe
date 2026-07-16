import { useMemo, useState } from 'react'
import type { GoalHierarchy, GoalHorizon, GoalPlan, PlanDay, PlanMonthNode, PlanWeekHierarchy } from '../../types/goalPlan'
import {
  getCurrentWeek,
  getTodayDay,
  isDayToday,
  monthIconFromKey,
  tierHeadline,
  weeksForMonth,
} from '../../lib/goalHierarchyEngine'
import {
  addDayItem,
  addMonthItem,
  addWeekItem,
  removeDayItem,
  removeMonthItem,
  removeWeekItem,
  toggleDayItem,
  toggleMonthNodeItem,
  toggleWeekItemH,
  upsertDayItemLabel,
  upsertMonthItemLabel,
  upsertWeekItemLabel,
} from '../../lib/goalHierarchyMutations'
import { monthKey } from '../../lib/goalCalendar'
import { EditableChecklist } from './GoalEditableChecklist'
import { SecLabel } from './GoalShell'

interface Props {
  plan: GoalPlan
  horizon: GoalHorizon
  onPersist: (plan: GoalPlan) => void
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

function initialOpenMonths(h: GoalHierarchy): Set<string> {
  const todayKey = monthKey(new Date())
  const current = h.months.find((m) => m.key === todayKey) ?? h.months[0]
  return new Set(current ? [current.id] : [])
}

function initialOpenWeeks(h: GoalHierarchy): Set<string> {
  const current = getCurrentWeek(h)
  return new Set(current ? [current.id] : [])
}

function initialOpenDays(h: GoalHierarchy): Set<string> {
  const today = getTodayDay(h)
  return new Set(today ? [today.id] : [])
}

function TreeChecklist({
  items,
  placeholder,
  onToggle,
  onLabelChange,
  onAdd,
  onRemove,
  size = 'md',
}: {
  items: Parameters<typeof EditableChecklist>[0]['items']
  placeholder: string
  onToggle: (id: string) => void
  onLabelChange: (id: string, label: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  size?: 'md' | 'sm' | 'xs'
}) {
  return (
    <EditableChecklist
      className={`goal-tree-checklist ${size}`}
      items={items}
      placeholder={placeholder}
      onToggle={onToggle}
      onLabelChange={onLabelChange}
      onAdd={onAdd}
      onRemove={onRemove}
    />
  )
}

function WeekBlock({
  plan,
  week,
  open,
  openDays,
  onToggleWeek,
  onToggleDay,
  onPersist,
}: {
  plan: GoalPlan
  week: PlanWeekHierarchy
  open: boolean
  openDays: Set<string>
  onToggleWeek: () => void
  onToggleDay: (dayId: string) => void
  onPersist: (plan: GoalPlan) => void
}) {
  const headline = tierHeadline(week.items, '이번 주 목표를 적어 보세요')
  const isCurrent = plan.hierarchy?.currentWeekId === week.id

  return (
    <div className={`goal-tree-week ${open ? 'open' : ''}`}>
      <button type="button" className="goal-tree-week-head" onClick={onToggleWeek}>
        <span className="goal-tree-icon w">{week.globalIndex}</span>
        <div className="goal-tree-head-text">
          <strong>
            {week.label} · {week.dateLabel}
            {isCurrent ? <em className="goal-tree-now">진행 중</em> : null}
          </strong>
          <span>{headline}</span>
        </div>
        <span className="goal-tree-chev" aria-hidden>
          {open ? '⌃' : '⌄'}
        </span>
      </button>

      {open ? (
        <div className="goal-tree-week-body">
          <TreeChecklist
            size="sm"
            items={week.items}
            placeholder="이번 주 목표"
            onToggle={(id) => onPersist(toggleWeekItemH(plan, week.id, id))}
            onLabelChange={(id, label) => onPersist(upsertWeekItemLabel(plan, week.id, id, label))}
            onAdd={() => onPersist(addWeekItem(plan, week.id))}
            onRemove={(id) => onPersist(removeWeekItem(plan, week.id, id))}
          />

          <div className="goal-tree-days">
            {week.days.map((day) => (
              <DayBlock
                key={day.id}
                plan={plan}
                weekId={week.id}
                day={day}
                open={openDays.has(day.id)}
                onToggle={() => onToggleDay(day.id)}
                onPersist={onPersist}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DayBlock({
  plan,
  weekId,
  day,
  open,
  onToggle,
  onPersist,
}: {
  plan: GoalPlan
  weekId: string | null
  day: PlanDay
  open: boolean
  onToggle: () => void
  onPersist: (plan: GoalPlan) => void
}) {
  const headline = tierHeadline(day.items, '오늘 이룰 목표')

  return (
    <div className={`goal-tree-day ${open ? 'open' : ''} ${isDayToday(day) ? 'today' : ''}`}>
      <button type="button" className="goal-tree-day-head" onClick={onToggle}>
        <span className="goal-tree-icon d">{day.dateLabel.split('/')[1] ?? '·'}</span>
        <div className="goal-tree-head-text">
          <strong>
            {day.dayOfWeek} · {day.dateLabel}
            {isDayToday(day) ? <em className="goal-tree-now">오늘</em> : null}
          </strong>
          <span>{headline}</span>
        </div>
        <span className="goal-tree-chev" aria-hidden>
          {open ? '⌃' : '⌄'}
        </span>
      </button>

      {open ? (
        <div className="goal-tree-day-body">
          <TreeChecklist
            size="xs"
            items={day.items}
            placeholder="오늘 이룰 목표"
            onToggle={(id) => onPersist(toggleDayItem(plan, weekId, day.id, id))}
            onLabelChange={(id, label) => onPersist(upsertDayItemLabel(plan, weekId, day.id, id, label))}
            onAdd={() => onPersist(addDayItem(plan, weekId, day.id))}
            onRemove={(id) => onPersist(removeDayItem(plan, weekId, day.id, id))}
          />
        </div>
      ) : null}
    </div>
  )
}

function MonthBlock({
  plan,
  h,
  month,
  open,
  openWeeks,
  openDays,
  onToggleMonth,
  onToggleWeek,
  onToggleDay,
  onPersist,
}: {
  plan: GoalPlan
  h: GoalHierarchy
  month: PlanMonthNode
  open: boolean
  openWeeks: Set<string>
  openDays: Set<string>
  onToggleMonth: () => void
  onToggleWeek: (weekId: string) => void
  onToggleDay: (dayId: string) => void
  onPersist: (plan: GoalPlan) => void
}) {
  const monthWeeks = weeksForMonth(h, month.key)
  const headline = tierHeadline(month.items, '이번 달 목표를 적어 보세요')

  return (
    <section className={`goal-tree-month ${open ? 'open' : ''}`}>
      <div className="goal-tree-month-top">
        <span className="goal-tree-icon g">{monthIconFromKey(month.key)}</span>
        <div className="goal-tree-head-text">
          <strong>{month.label}</strong>
          <span>{headline}</span>
        </div>
      </div>

      <TreeChecklist
        items={month.items}
        placeholder="이번 달 목표"
        onToggle={(id) => onPersist(toggleMonthNodeItem(plan, month.id, id))}
        onLabelChange={(id, label) => onPersist(upsertMonthItemLabel(plan, month.id, id, label))}
        onAdd={() => onPersist(addMonthItem(plan, month.id))}
        onRemove={(id) => onPersist(removeMonthItem(plan, month.id, id))}
      />

      <button type="button" className="goal-tree-expand" onClick={onToggleMonth}>
        <span>주간 · {monthWeeks.length}주</span>
        <span className="goal-tree-chev">{open ? '⌃' : '⌄'}</span>
      </button>

      {open ? (
        <div className="goal-tree-weeks">
          {monthWeeks.map((week) => (
            <WeekBlock
              key={week.id}
              plan={plan}
              week={week}
              open={openWeeks.has(week.id)}
              openDays={openDays}
              onToggleWeek={() => onToggleWeek(week.id)}
              onToggleDay={onToggleDay}
              onPersist={onPersist}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function GoalHierarchyTree({ plan, horizon, onPersist }: Props) {
  const h = plan.hierarchy
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => (h ? initialOpenMonths(h) : new Set()))
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => (h ? initialOpenWeeks(h) : new Set()))
  const [openDays, setOpenDays] = useState<Set<string>>(() => (h ? initialOpenDays(h) : new Set()))

  const label = useMemo(() => {
    if (horizon === 'month-week-day') return '월 · 주 · 일 목표'
    if (horizon === 'week-day') return '주 · 일 목표'
    return '일별 목표'
  }, [horizon])

  if (!h) return null

  if (horizon === 'day-only') {
    return (
      <div className="goal-tree">
        <SecLabel>{label}</SecLabel>
        {h.days.map((day) => (
          <div key={day.id} className={`goal-tree-day flat ${isDayToday(day) ? 'today' : ''}`}>
            <div className="goal-tree-day-head static">
              <span className="goal-tree-icon d">{day.dateLabel.split('/')[1] ?? '·'}</span>
              <div className="goal-tree-head-text">
                <strong>
                  {day.dayOfWeek} · {day.dateLabel}
                  {isDayToday(day) ? <em className="goal-tree-now">오늘</em> : null}
                </strong>
              </div>
            </div>
            <TreeChecklist
              size="sm"
              items={day.items}
              placeholder="오늘 이룰 목표"
              onToggle={(id) => onPersist(toggleDayItem(plan, null, day.id, id))}
              onLabelChange={(id, label) => onPersist(upsertDayItemLabel(plan, null, day.id, id, label))}
              onAdd={() => onPersist(addDayItem(plan, null, day.id))}
              onRemove={(id) => onPersist(removeDayItem(plan, null, day.id, id))}
            />
          </div>
        ))}
      </div>
    )
  }

  if (horizon === 'week-day') {
    return (
      <div className="goal-tree">
        <SecLabel>{label}</SecLabel>
        {h.weeks.map((week) => (
          <WeekBlock
            key={week.id}
            plan={plan}
            week={week}
            open={openWeeks.has(week.id)}
            openDays={openDays}
            onToggleWeek={() => setOpenWeeks((s) => toggleInSet(s, week.id))}
            onToggleDay={(dayId) => setOpenDays((s) => toggleInSet(s, dayId))}
            onPersist={onPersist}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="goal-tree">
      <SecLabel>{label}</SecLabel>
      {h.months.map((month) => (
        <MonthBlock
          key={month.id}
          plan={plan}
          h={h}
          month={month}
          open={openMonths.has(month.id)}
          openWeeks={openWeeks}
          openDays={openDays}
          onToggleMonth={() => setOpenMonths((s) => toggleInSet(s, month.id))}
          onToggleWeek={(weekId) => setOpenWeeks((s) => toggleInSet(s, weekId))}
          onToggleDay={(dayId) => setOpenDays((s) => toggleInSet(s, dayId))}
          onPersist={onPersist}
        />
      ))}
    </div>
  )
}
