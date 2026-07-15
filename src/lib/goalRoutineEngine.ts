import type { GoalIntake, GoalPlan, PlanWeekHierarchy } from '../types/goalPlan'
import { ROUTINE_SESSION_LABELS } from './goalCreationConfig'
import { getCurrentWeek } from './goalHierarchyEngine'

function legacyTimesFromFrequency(freq?: GoalIntake['routineFrequency']): number | undefined {
  switch (freq) {
    case 'weekly':
      return 1
    case 'few_times_week':
      return 3
    case 'five_times_week':
      return 5
    case 'daily_light':
    case 'daily_moderate':
      return 7
    default:
      return undefined
  }
}

/** 제목에서 횟수 추론 (레거시 데이터 마이그레이션용) */
export function inferTimesPerWeekFromText(text: string): number | undefined {
  const t = text.replace(/\s/g, '')
  const m = t.match(/주(\d)회/)
  if (m) return Math.min(7, Math.max(1, Number(m[1])))
  if (/주5회|5회/.test(t)) return 5
  if (/매일|하루/.test(t)) return 7
  if (/주1회|주간/.test(t)) return 1
  return undefined
}

export function getRoutineWeeklyTarget(plan: GoalPlan): number {
  const intake = plan.intake
  if (intake.routineTimesPerWeek != null) {
    return Math.min(7, Math.max(1, intake.routineTimesPerWeek))
  }
  const legacy = legacyTimesFromFrequency(intake.routineFrequency)
  if (legacy != null) return legacy
  const inferred = inferTimesPerWeekFromText(`${plan.title} ${plan.intake.successCriteria}`)
  if (inferred != null) return inferred
  return 3
}

export function getRoutineFrequencyLabel(plan: GoalPlan): string {
  const n = getRoutineWeeklyTarget(plan)
  if (n >= 7) {
    const len = plan.intake.routineSessionLength
    if (len === 'light') return ROUTINE_SESSION_LABELS.light
    if (len === 'moderate') return ROUTINE_SESSION_LABELS.moderate
    return '매일'
  }
  return `주 ${n}회`
}

export function isDayRoutineDone(dayItems: { done: boolean; label: string }[]): boolean {
  const active = dayItems.filter((it) => it.label.trim())
  if (!active.length) return false
  return active.some((it) => it.done)
}

export interface RoutineDayStatus {
  dateLabel: string
  dayOfWeek: string
  done: boolean
  isToday?: boolean
  dayId: string
}

export interface RoutineWeekProgress {
  week: PlanWeekHierarchy
  target: number
  done: number
  pct: number
  days: RoutineDayStatus[]
  onTrack: boolean
}

export function getRoutineWeekProgress(plan: GoalPlan, week: PlanWeekHierarchy): RoutineWeekProgress {
  const target = getRoutineWeeklyTarget(plan)
  const days: RoutineDayStatus[] = week.days.map((d) => ({
    dateLabel: d.dateLabel,
    dayOfWeek: d.dayOfWeek,
    done: isDayRoutineDone(d.items),
    isToday: d.isToday,
    dayId: d.id,
  }))
  const done = days.filter((d) => d.done).length
  const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0
  return { week, target, done, pct, days, onTrack: done >= target }
}

export function getCurrentRoutineProgress(plan: GoalPlan): RoutineWeekProgress | null {
  const h = plan.hierarchy
  if (!h) return null
  const week = getCurrentWeek(h)
  if (!week) return null
  return getRoutineWeekProgress(plan, week)
}

export function getRoutineWeekHistory(plan: GoalPlan, limit = 6): RoutineWeekProgress[] {
  const h = plan.hierarchy
  if (!h?.weeks.length) return []
  const current = getCurrentWeek(h)
  const idx = current ? h.weeks.findIndex((w) => w.id === current.id) : h.weeks.length - 1
  const start = Math.max(0, idx - limit + 1)
  return h.weeks.slice(start, idx + 1).map((w) => getRoutineWeekProgress(plan, w))
}

export function routineStreakWeeks(plan: GoalPlan): number {
  const h = plan.hierarchy
  if (!h?.weeks.length) return 0
  const current = getCurrentWeek(h)
  const idx = current ? h.weeks.findIndex((w) => w.id === current.id) : h.weeks.length - 1
  let streak = 0
  for (let i = idx; i >= 0; i--) {
    const p = getRoutineWeekProgress(plan, h.weeks[i])
    if (p.onTrack) streak++
    else break
  }
  return streak
}

export function isRoutinePlan(plan: GoalPlan): boolean {
  return plan.templateType === 'routine'
}

export function migrateRoutineIntake(intake: GoalIntake, title: string): GoalIntake {
  if (intake.routineTimesPerWeek != null) return intake
  const legacy = legacyTimesFromFrequency(intake.routineFrequency)
  const inferred = legacy ?? inferTimesPerWeekFromText(title)
  if (inferred == null) return intake
  return { ...intake, routineTimesPerWeek: inferred }
}
