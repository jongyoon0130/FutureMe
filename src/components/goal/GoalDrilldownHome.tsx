import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  MISC_PLAN_ID,
  loadMiscTodos,
  miscAggregatedForDate,
  removeMiscTodo,
  toggleMiscTodo,
  updateMiscTodoLabel,
  type MiscTodoItem,
} from '../../lib/goalMiscTodos'
import type { SelfProfile } from '../../types/self'
import type { GoalPlan } from '../../types/goalPlan'
import { GoalDayClose } from './GoalDayClose'
import { daysUntilDeadline, planProgress } from '../../lib/goalPlanBridge'
import {
  aggregateForDate,
  countItems,
  getCurrentWeek,
  itemsPreview,
  pctItems,
  planSummaryFromHierarchy,
  plansForDate,
  resolveHorizon,
  resolveDateSlots,
  weeksForMonth,
} from '../../lib/goalHierarchyEngine'
import { rootScreenTier } from '../../lib/goalHorizon'
import {
  addDayItem,
  addMonthItem,
  addWeekItem,
  removeDayItem,
  removeMonthItem,
  removeWeekItem,
  removeAggregatedItem,
  toggleAggregatedItem,
  updateAggregatedItemLabel,
  toggleDayItem,
  toggleMonthNodeItem,
  toggleWeekItemH,
  upsertDayItemLabel,
  upsertMonthItemLabel,
  upsertWeekItemLabel,
} from '../../lib/goalHierarchyMutations'
import { touchGoalPlan, deleteGoalPlan } from '../../lib/goalPlanStore'
import { GOAL_DATA_SYNC_EVENT } from '../../lib/goalDataSync'
import { getRoutineWeekProgress, isRoutinePlan } from '../../lib/goalRoutineEngine'
import { GoalEditPlanForm } from './GoalEditPlanForm'
import { GoalHierarchyTree } from './GoalHierarchyTree'
import { GoalHomeTierAddRow, isSameCalendarDay } from './GoalHomeTierAddRow'
import { GoalMotivationCard, GoalMotivationForm } from './GoalMotivationForm'
import { GoalRoutineDashboard } from './GoalRoutineDashboard'
import { GoalSwipeDelete } from './GoalSwipeDelete'
import { EditableChecklist } from './GoalEditableChecklist'
import {
  GoalBranch,
  GoalCheckRow,
  GoalHero,
  GoalNav,
  GoalStack,
  MiniCalendar,
  SecLabel,
} from './GoalShell'

type Screen = 'home' | 'root' | 'month' | 'week' | 'day' | 'edit' | 'motivation'

interface Props {
  plans: GoalPlan[]
  profile: SelfProfile
  onPlansChange: (plans: GoalPlan[]) => void
  onOpenPlan?: (planId: string) => void
  onBack?: () => void
  initialPlanId?: string | null
}

export function GoalDrilldownHome({
  plans,
  profile,
  onPlansChange,
  onOpenPlan,
  onBack,
  initialPlanId = null,
}: Props) {
  const [stack, setStack] = useState<Screen[]>(initialPlanId ? ['root'] : ['home'])
  const [planId, setPlanId] = useState<string | null>(initialPlanId)
  const [monthId, setMonthId] = useState<string | null>(null)
  const [weekId, setWeekId] = useState<string | null>(null)
  const [dayId, setDayId] = useState<string | null>(null)
  const [selectedDay, setSelectedDay] = useState<number>(() => new Date().getDate())
  const [calYear, setCalYear] = useState<number>(() => new Date().getFullYear())
  const [calMonth, setCalMonth] = useState<number>(() => new Date().getMonth())
  const [addingTier, setAddingTier] = useState<'daily' | 'weekly' | 'monthly' | null>(null)
  const [miscTodos, setMiscTodos] = useState<MiscTodoItem[]>(() => loadMiscTodos(profile.id))

  useEffect(() => {
    const onSynced = () => setMiscTodos(loadMiscTodos(profile.id))
    window.addEventListener(GOAL_DATA_SYNC_EVENT, onSynced)
    return () => window.removeEventListener(GOAL_DATA_SYNC_EVENT, onSynced)
  }, [profile.id])

  const now = new Date()
  const selectedDate = useMemo(() => {
    return new Date(calYear, calMonth, selectedDay, 12, 0, 0, 0)
  }, [selectedDay, calYear, calMonth])

  const handleMonthChange = (year: number, month: number) => {
    setCalYear(year)
    setCalMonth(month)
    const dim = new Date(year, month + 1, 0).getDate()
    setSelectedDay((d) => Math.min(d, dim))
    setAddingTier(null)
  }

  const jumpToToday = () => {
    setCalYear(now.getFullYear())
    setCalMonth(now.getMonth())
    setSelectedDay(now.getDate())
    setAddingTier(null)
  }

  const isTodaySelected = isSameCalendarDay(selectedDate, now)
  const aggregated = useMemo(() => aggregateForDate(plans, selectedDate), [plans, selectedDate])
  const eligiblePlans = useMemo(() => plansForDate(plans, selectedDate), [plans, selectedDate])
  const miscAgg = useMemo(() => miscAggregatedForDate(miscTodos, selectedDate), [miscTodos, selectedDate])

  const tierSections = useMemo(() => {
    const weekLabel = eligiblePlans.find((e) => e.slots.weekLabel)?.slots.weekLabel
    const monthLabel = eligiblePlans.find((e) => e.slots.monthLabel)?.slots.monthLabel

    return [
      {
        key: 'daily' as const,
        list: [...aggregated.daily, ...miscAgg.daily],
        title: isTodaySelected ? '오늘 할 일' : `${selectedDate.getMonth() + 1}/${selectedDate.getDate()} 할 일`,
        badge: 'd' as const,
        placeholder: '할 일 입력',
      },
      {
        key: 'weekly' as const,
        list: [...aggregated.weekly, ...miscAgg.weekly],
        title: isTodaySelected ? '이번 주' : '그 주 목표',
        badge: 'w' as const,
        placeholder: weekLabel ? `${weekLabel} 목표` : '이번 주 목표',
      },
      {
        key: 'monthly' as const,
        list: [...aggregated.monthly, ...miscAgg.monthly],
        title: isTodaySelected ? '이번 달' : `${selectedDate.getMonth() + 1}월`,
        badge: 'm' as const,
        placeholder: monthLabel ? `${monthLabel} 목표` : '이번 달 목표',
      },
    ]
  }, [aggregated, miscAgg, eligiblePlans, isTodaySelected, selectedDate])

  const plan = plans.find((p) => p.id === planId) ?? null
  const h = plan?.hierarchy
  const horizon = h ? resolveHorizon(h) : undefined
  const month = h?.months.find((m) => m.id === monthId)
  const week = h?.weeks.find((w) => w.id === weekId) ?? (h ? getCurrentWeek(h) : undefined)
  const day =
    h?.horizon === 'day-only'
      ? h.days.find((d) => d.id === dayId)
      : week?.days.find((d) => d.id === dayId)

  const screen = stack[stack.length - 1]

  const handleDeletePlan = (id: string) => {
    const p = plans.find((x) => x.id === id)
    if (!p) return
    if (!window.confirm(`'${p.title}' 목표를 삭제할까요?`)) return
    deleteGoalPlan(p.profileId, id)
    const next = plans.filter((x) => x.id !== id)
    onPlansChange(next)
    if (planId === id) {
      setPlanId(null)
      setStack(['home'])
    }
  }

  const persist = (next: GoalPlan) => {
    touchGoalPlan(next.profileId, next)
    onPlansChange(plans.map((p) => (p.id === next.id ? next : p)))
  }

  const pop = () => {
    if (stack.length <= 1) {
      onBack?.()
      return
    }
    setStack((st) => st.slice(0, -1))
    if (stack.length === 2) {
      setPlanId(null)
      setMonthId(null)
      setWeekId(null)
      setDayId(null)
    }
  }

  const openRoot = (id: string) => {
    setPlanId(id)
    setMonthId(null)
    setWeekId(null)
    setDayId(null)
    onOpenPlan?.(id)
    setStack(['home', 'root'])
  }

  const openTierFromHome = (id: string, tier: 'daily' | 'weekly' | 'monthly') => {
    const p = plans.find((x) => x.id === id)
    if (!p?.hierarchy) return
    const slots = resolveDateSlots(p.hierarchy, selectedDate)
    setPlanId(id)
    onOpenPlan?.(id)

    if (tier === 'monthly' && slots.monthId) {
      setMonthId(slots.monthId)
      setStack((st) => [...st, 'month'])
    } else if (tier === 'weekly' && slots.weekId) {
      setWeekId(slots.weekId)
      setStack((st) => [...st, 'week'])
    } else if (tier === 'daily' && slots.dayId) {
      if (slots.dayWeekId) setWeekId(slots.dayWeekId)
      setDayId(slots.dayId)
      setStack((st) => [...st, 'day'])
    }
  }

  const openWeek = (wid: string) => {
    setWeekId(wid)
    setStack((st) => [...st, 'week'])
  }

  const openEdit = () => {
    setStack((st) => [...st, 'edit'])
  }

  const openMotivation = () => {
    setStack((st) => [...st, 'motivation'])
  }

  const handleMotivationSave = (next: GoalPlan) => {
    persist(next)
    setStack((st) => st.slice(0, -1))
  }

  const handleEditSave = (next: GoalPlan) => {
    persist(next)
    setStack((st) => st.slice(0, -1))
    const nh = next.hierarchy
    if (nh && monthId && !nh.months.some((m) => m.id === monthId)) setMonthId(null)
    if (nh && weekId && !nh.weeks.some((w) => w.id === weekId)) setWeekId(null)
    if (nh && dayId) {
      const dayExists =
        nh.horizon === 'day-only'
          ? nh.days.some((d) => d.id === dayId)
          : nh.weeks.some((w) => w.days.some((d) => d.id === dayId))
      if (!dayExists) setDayId(null)
    }
  }
  const openDay = (did: string, wid?: string) => {
    if (wid) setWeekId(wid)
    setDayId(did)
    setStack((st) => [...st, 'day'])
  }

  const todayStr = isTodaySelected
    ? `${now.getMonth() + 1}월 ${now.getDate()}일`
    : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`
  const allCount = countItems([...aggregated.daily, ...aggregated.weekly, ...aggregated.monthly])
  // 하루 마감의 근거 = "오늘 할 일" (목표 일간 + 일상 투두)
  const dailyCount = countItems([...aggregated.daily, ...miscAgg.daily])
  // 타임캡슐 — 목표를 만들 때 쓴 "이뤘을 때" 답변이, 다 이뤘거나 마감일이 온 날 편지로 도착
  const timeCapsules = plans.filter((p) => {
    const letter = p.motivation?.['success-both']?.trim()
    if (!letter) return false
    const prog = planProgress(p)
    const achieved = prog.total > 0 && prog.done === prog.total
    const dday = p.intake?.deadline ? daysUntilDeadline(p.intake.deadline, now) : null
    return achieved || (dday != null && dday <= 0)
  })

  const getDailyStats = useCallback(
    (day: number) => {
      const date = new Date(calYear, calMonth, day, 12, 0, 0, 0)
      const goalAgg = aggregateForDate(plans, date)
      const miscAgg = miscAggregatedForDate(miscTodos, date)
      const all = [
        ...goalAgg.daily,
        ...goalAgg.weekly,
        ...goalAgg.monthly,
        ...miscAgg.daily,
        ...miscAgg.weekly,
        ...miscAgg.monthly,
      ]
      const { done, total } = countItems(all)
      const inRange =
        plans.some((p) => p.hierarchy && resolveDateSlots(p.hierarchy, date).inRange) || total > 0
      if (!total) return { done: 0, total: 0, pct: 0, inRange }
      return { done, total, pct: Math.round((done / total) * 100), inRange }
    },
    [plans, miscTodos, calYear, calMonth],
  )

  const homeScreen = (
    <>
      <GoalNav tier="홈" title="나의 목표" />
      <div className="goal-scroll">
        <p className="goal-home-title">{isTodaySelected ? '오늘' : '선택한 날'}</p>
        <p className="goal-home-sub">
          {todayStr} · {allCount.done}/{allCount.total}
        </p>
        <MiniCalendar
          year={calYear}
          month={calMonth}
          selectedDay={selectedDay}
          onSelectDay={(d) => {
            setSelectedDay(d)
            setAddingTier(null)
          }}
          onMonthChange={handleMonthChange}
          onJumpToday={jumpToToday}
          getDailyStats={getDailyStats}
        />
        {tierSections.map(({ key, list, title, badge, placeholder }) => (
          <section key={key} className="goal-sec">
            <div className="goal-sec-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`goal-badge ${badge}`}>{badge === 'd' ? '일간' : badge === 'w' ? '주간' : '월간'}</span>
                <h2>{title}</h2>
              </div>
              <div className="goal-sec-actions">
                <button
                  type="button"
                  className={`goal-sec-add ${addingTier === key ? 'on' : ''}`}
                  onClick={() => setAddingTier((t) => (t === key ? null : key))}
                  aria-label={`${title} 추가`}
                >
                  +
                </button>
                <span className="goal-count">
                  {countItems(list).done}/{countItems(list).total}
                </span>
              </div>
            </div>
            {addingTier === key ? (
              <GoalHomeTierAddRow
                tier={key}
                date={selectedDate}
                goalOptions={eligiblePlans}
                profileId={profile.id}
                miscTodos={miscTodos}
                onMiscChange={setMiscTodos}
                placeholder={placeholder}
                onGoalSave={persist}
                onCancel={() => setAddingTier(null)}
              />
            ) : null}
            {list.map((it) => (
              <GoalCheckRow
                key={`${it.planId}-${it.id}`}
                done={it.done}
                goalName={it.planTitle}
                text={it.label}
                onToggle={() => {
                  if (it.planId === MISC_PLAN_ID) {
                    setMiscTodos(toggleMiscTodo(profile.id, miscTodos, it.id))
                    return
                  }
                  const u = toggleAggregatedItem(plans, it.planId, it.id, key)
                  if (u) persist(u)
                }}
                onLabelChange={(label) => {
                  if (it.planId === MISC_PLAN_ID) {
                    setMiscTodos(updateMiscTodoLabel(profile.id, miscTodos, it.id, label))
                    return
                  }
                  const u = updateAggregatedItemLabel(plans, it.planId, it.id, key, label)
                  if (u) persist(u)
                }}
                onLabelCommit={(label) => {
                  if (label.trim()) return
                  if (it.planId === MISC_PLAN_ID) {
                    setMiscTodos(removeMiscTodo(profile.id, miscTodos, it.id))
                    return
                  }
                  const u = removeAggregatedItem(plans, it.planId, it.id, key)
                  if (u) persist(u)
                }}
                onDrill={it.planId === MISC_PLAN_ID ? undefined : () => openTierFromHome(it.planId, key)}
              />
            ))}
          </section>
        ))}
        {!plans.length ? (
          <p className="goal-empty">+ 로 최종 목표를 만들면 기간별 계획도 함께 관리할 수 있어요</p>
        ) : null}
        {isTodaySelected ? (
          <GoalDayClose
            ownerId={profile.id}
            done={dailyCount.done}
            total={dailyCount.total}
            plans={plans}
          />
        ) : null}
        {timeCapsules.map((p) => {
          const prog = planProgress(p)
          const achieved = prog.total > 0 && prog.done === prog.total
          return (
            <section key={`letter-${p.id}`} className="goal-letter">
              <p className="goal-letter-tag">📮 과거의 네가 보낸 편지 · “{p.title}”을 시작하던 날</p>
              <p className="goal-letter-body">“{p.motivation?.['success-both']?.trim()}”</p>
              <p className="goal-letter-foot">
                {achieved
                  ? '그때 상상한 오늘에 진짜로 도착했어.'
                  : '마감일이 왔어. 그날의 상상과 지금을 비교해봐 — 거기까지의 거리가 다음 목표가 돼.'}
              </p>
            </section>
          )
        })}
        <SecLabel>최종 목표 · 탭하면 가지치기</SecLabel>
        {plans.map((p) => (
          <GoalSwipeDelete key={p.id} onDelete={() => handleDeletePlan(p.id)}>
            <GoalBranch
              tone="g"
              icon={isRoutinePlan(p) ? '🔄' : '🎯'}
              title={p.title}
              sub={planSummaryFromHierarchy(p)}
              onClick={() => openRoot(p.id)}
            />
          </GoalSwipeDelete>
        ))}
      </div>
    </>
  )

  let rootScreen = null
  let monthScreen = null
  let weekScreen = null
  let dayScreen = null

  if (plan && h && horizon) {
    const routine = isRoutinePlan(plan)
    rootScreen = (
      <>
        <GoalNav tier={rootScreenTier(horizon)} tierClass="f" title={plan.title.slice(0, 20)} onBack={pop} action={{ label: '편집', onClick: openEdit }} />
        <div className="goal-scroll">
          <GoalHero tag="최종 목표" tagClass="f" title={plan.title} sub={h.rangeLabel} />
          <GoalMotivationCard plan={plan} onEdit={openMotivation} />
          {routine ? (
            <GoalRoutineDashboard
              plan={plan}
              onOpenWeek={openWeek}
              onOpenDay={(did, wid) => openDay(did, wid)}
            />
          ) : (
            <GoalHierarchyTree plan={plan} horizon={horizon} onPersist={persist} />
          )}
        </div>
      </>
    )
  }

  if (month && h && plan) {
    const monthWeeks = weeksForMonth(h, month.key)
    monthScreen = (
      <>
        <GoalNav tier="월간" tierClass="m" title={month.label} onBack={pop} />
        <div className="goal-scroll">
          <SecLabel>목표 체크리스트</SecLabel>
          <EditableChecklist
            items={month.items}
            placeholder="이번 달 목표"
            onToggle={(id) => persist(toggleMonthNodeItem(plan, month.id, id))}
            onLabelChange={(id, label) => persist(upsertMonthItemLabel(plan, month.id, id, label))}
            onAdd={() => persist(addMonthItem(plan, month.id))}
            onRemove={(id) => persist(removeMonthItem(plan, month.id, id))}
          />
          <SecLabel>주간 · 탭하면 이번 주 목표</SecLabel>
          {monthWeeks.map((w) => (
            <GoalBranch
              key={w.id}
              tone="w"
              icon={String(w.globalIndex)}
              title={`${w.label} · ${w.dateLabel}`}
              sub={itemsPreview(w.items)}
              pct={pctItems(w.items)}
              onClick={() => openWeek(w.id)}
            />
          ))}
        </div>
      </>
    )
  }

  if (week && h && plan) {
    const routineWeek = isRoutinePlan(plan) ? getRoutineWeekProgress(plan, week) : null
    weekScreen = (
      <>
        <GoalNav tier="주간" tierClass="w" title={`${week.label} · ${week.dateLabel}`} onBack={pop} />
        <div className="goal-scroll">
          {routineWeek ? (
            <div className="goal-routine-week-banner">
              <span className="goal-routine-badge">이번 주 루틴</span>
              <strong>
                {routineWeek.done}/{routineWeek.target}회
              </strong>
              <div className="goal-routine-history-bar wide">
                <i style={{ width: `${routineWeek.pct}%` }} />
              </div>
            </div>
          ) : null}
          <SecLabel>목표 체크리스트</SecLabel>
          <EditableChecklist
            items={week.items}
            placeholder="이번 주 목표"
            onToggle={(id) => persist(toggleWeekItemH(plan, week.id, id))}
            onLabelChange={(id, label) => persist(upsertWeekItemLabel(plan, week.id, id, label))}
            onAdd={() => persist(addWeekItem(plan, week.id))}
            onRemove={(id) => persist(removeWeekItem(plan, week.id, id))}
          />
          <SecLabel>일간 · 탭하면 오늘 할 일</SecLabel>
          {week.days.map((d) => (
            <GoalBranch
              key={d.id}
              tone="d"
              icon={d.dateLabel.split('/')[1] ?? '·'}
              title={`${d.dayOfWeek} · ${d.dateLabel}`}
              sub={`${itemsPreview(d.items)}${d.isToday ? ' · 오늘' : ''}`}
              onClick={() => openDay(d.id, week.id)}
            />
          ))}
        </div>
      </>
    )
  }

  if (day && h && plan) {
    const wid = h.horizon === 'day-only' ? null : week?.id ?? null
    dayScreen = (
      <>
        <GoalNav tier="일간" tierClass="d" title={`${day.dateLabel} · ${day.dayOfWeek}`} onBack={pop} />
        <div className="goal-scroll">
          <SecLabel>{day.isToday ? '오늘 목표 체크리스트' : '목표 체크리스트'}</SecLabel>
          <EditableChecklist
            items={day.items}
            placeholder="오늘 이룰 목표"
            onToggle={(id) => persist(toggleDayItem(plan, wid, day.id, id))}
            onLabelChange={(id, label) => persist(upsertDayItemLabel(plan, wid, day.id, id, label))}
            onAdd={() => persist(addDayItem(plan, wid, day.id))}
            onRemove={(id) => persist(removeDayItem(plan, wid, day.id, id))}
          />
        </div>
      </>
    )
  }

  let editScreen = null
  if (plan?.hierarchy) {
    editScreen = <GoalEditPlanForm plan={plan} onSave={handleEditSave} onCancel={pop} />
  }

  let motivationScreen = null
  if (plan) {
    motivationScreen = (
      <GoalMotivationForm plan={plan} onSave={handleMotivationSave} onCancel={pop} />
    )
  }

  const screens: Record<string, ReactNode> = { home: homeScreen }
  if (rootScreen) screens.root = rootScreen
  if (monthScreen) screens.month = monthScreen
  if (weekScreen) screens.week = weekScreen
  if (dayScreen) screens.day = dayScreen
  if (editScreen) screens.edit = editScreen
  if (motivationScreen) screens.motivation = motivationScreen

  const activeScreen = screens[screen] != null ? screen : 'home'

  return <GoalStack active={activeScreen} stack={stack} screens={screens} />
}
