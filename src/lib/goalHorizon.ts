/** 목표 기간(horizon)에 따른 가지 깊이 */

import {
  DAY_ONLY_MAX_DAYS,
  buildTimeline,
  parseIso,
  rangeLabel,
  usesMonthPlan,
  usesWeekPlan,
} from './goalCalendar'

export type GoalHorizon = 'day-only' | 'week-day' | 'month-week-day'

export type WizardStepKey = 'final' | 'months' | 'weeks' | 'days'

export interface HorizonMeta {
  horizon: GoalHorizon
  daysTotal: number
  monthCount: number
  weekCount: number
  dayCount: number
  rangeLabel: string
  wizardSteps: WizardStepKey[]
  showMonthLayer: boolean
  showWeekLayer: boolean
  hint: string
}

export function detectHorizon(deadline: string, start = new Date()): GoalHorizon {
  const s = new Date(start)
  s.setHours(12, 0, 0, 0)
  const end = parseIso(deadline)
  const timeline = buildTimeline(s, end)

  if (!usesWeekPlan(timeline.daysTotal)) return 'day-only'
  if (usesMonthPlan(timeline.monthKeys.length)) return 'month-week-day'
  return 'week-day'
}

export function getHorizonMeta(deadline: string, start = new Date()): HorizonMeta {
  const s = new Date(start)
  s.setHours(12, 0, 0, 0)
  const end = parseIso(deadline)
  const timeline = buildTimeline(s, end)
  const horizon = detectHorizon(deadline, start)
  const range = rangeLabel(s, end)

  const wizardSteps: WizardStepKey[] = ['final']
  if (horizon === 'day-only') wizardSteps.push('days')
  else if (horizon === 'week-day') wizardSteps.push('weeks', 'days')
  else wizardSteps.push('months', 'weeks', 'days')

  const hints: Record<GoalHorizon, string> = {
    'day-only': `${timeline.daysTotal}일 — 1.5주 미만이라 일별로만 계획해요`,
    'week-day': `${timeline.daysTotal}일 · ${timeline.weeks.length}주 — 주간 + 일간`,
    'month-week-day': `${timeline.daysTotal}일 · ${timeline.monthKeys.length}개월 · ${timeline.weeks.length}주 — 월 → 주 → 일`,
  }

  return {
    horizon,
    daysTotal: timeline.daysTotal,
    monthCount: timeline.monthKeys.length,
    weekCount: timeline.weeks.length,
    dayCount: timeline.daysTotal,
    rangeLabel: range,
    wizardSteps,
    showMonthLayer: horizon === 'month-week-day',
    showWeekLayer: horizon !== 'day-only',
    hint: hints[horizon],
  }
}

export function rootScreenTier(h: GoalHorizon): string {
  if (h === 'day-only') return '목표'
  if (h === 'week-day') return '기간'
  return '월간'
}

export function rootScreenTitle(h: GoalHorizon, range: string): string {
  if (h === 'day-only') return range || '일별'
  if (h === 'week-day') return range || '주간'
  return '월별'
}

export { DAY_ONLY_MAX_DAYS }
