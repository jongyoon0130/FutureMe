// ---------------------------------------------------------------------------
// 계획표(홈 목표 앱) → 미래의 나 대화 — 읽기 전용 다리.
//
// 홈 계획표는 자체 저장소(goal-plans-{ownerId})를 쓴다. 이 모듈은 그 데이터를
// "읽기만" 해서 미래의 나 프롬프트에 요약을 공급한다. 마이그레이션·저장 등
// 부작용이 있는 goalPlanStore를 거치지 않으므로, 프롬프트 조립 중에 계획표
// 데이터가 변형될 걱정이 없다. (쓰기 연동은 목표 앱 쪽에서 진행)
// ---------------------------------------------------------------------------
import type { GoalMotivationAnswers, GoalPlan } from '../types/goalPlan'
import { aggregateForDate, type AggregatedItem } from './goalHierarchyEngine'
import {
  MISC_PLAN_ID,
  MISC_PLAN_TITLE,
  periodKeyForTier,
  type MiscTodoItem,
} from './goalMiscTodos'

const OWNER_KEY = 'goal-app-owner-id'
const PLANS_PREFIX = 'goal-plans-'
const MISC_PREFIX = 'goal-misc-todos-'
const MAX_PLANS = 8
const MAX_TASKS_PER_TIER = 12

const MOTIVATION_LABELS: Record<keyof GoalMotivationAnswers, string> = {
  'why-truth': '시작한 진짜 이유',
  'success-both': '이뤘을 때 기분·변화',
  'failure-pattern': '미달·반쯤만 할 때 반복될 모습',
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function readOwnerId(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

/** 홈 계획표의 목표들 (최근 수정 순). 계획표를 안 썼으면 빈 배열. */
export function readGoalPlansLite(): GoalPlan[] {
  try {
    const owner = readOwnerId()
    if (!owner) return []
    const list = readJson<GoalPlan[]>(`${PLANS_PREFIX}${owner}`)
    if (!Array.isArray(list)) return []
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  } catch {
    return []
  }
}

function readMiscTodosLite(owner: string): MiscTodoItem[] {
  const list = readJson<MiscTodoItem[]>(`${MISC_PREFIX}${owner}`)
  if (!Array.isArray(list)) return []
  return list.filter((it) => it.label.trim())
}

export function daysUntilDeadline(deadline: string, now = new Date()): number | null {
  const d = new Date(`${deadline}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const base = new Date(now)
  base.setHours(12, 0, 0, 0)
  return Math.round((d.getTime() - base.getTime()) / 86400000)
}

function todayPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 홈 '오늘 할 일'(일상 투두) 진행 — 없으면 null */
export function todayMiscProgress(now = new Date()): { done: number; total: number } | null {
  try {
    const owner = readOwnerId()
    if (!owner) return null
    const key = todayPeriodKey(now)
    const today = readMiscTodosLite(owner).filter((t) => t.tier === 'daily' && t.periodKey === key)
    if (!today.length) return null
    return { done: today.filter((t) => t.done).length, total: today.length }
  } catch {
    return null
  }
}

const clip = (v: string, max: number): string => {
  const t = v.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

function miscAggregatedLite(items: MiscTodoItem[], date: Date): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const dailyKey = periodKeyForTier('daily', date)
  const weeklyKey = periodKeyForTier('weekly', date)
  const monthlyKey = periodKeyForTier('monthly', date)

  const toAgg = (filtered: MiscTodoItem[], tier: AggregatedItem['tier']): AggregatedItem[] =>
    filtered.map((it) => ({
      id: it.id,
      label: it.label,
      done: it.done,
      planId: MISC_PLAN_ID,
      planTitle: MISC_PLAN_TITLE,
      tier,
    }))

  return {
    daily: toAgg(items.filter((it) => it.tier === 'daily' && it.periodKey === dailyKey), 'daily'),
    weekly: toAgg(items.filter((it) => it.tier === 'weekly' && it.periodKey === weeklyKey), 'weekly'),
    monthly: toAgg(items.filter((it) => it.tier === 'monthly' && it.periodKey === monthlyKey), 'monthly'),
  }
}

function describeMotivation(plan: GoalPlan): string[] {
  const lines: string[] = []
  for (const [id, label] of Object.entries(MOTIVATION_LABELS) as [keyof GoalMotivationAnswers, string][]) {
    const ans = plan.motivation?.[id]?.trim()
    if (ans) lines.push(`  · ${label}(본인 표현): "${clip(ans, 100)}"`)
  }
  return lines
}

function formatTaskLine(item: AggregatedItem): string {
  const status = item.done ? '[완료]' : '[ ]'
  const goal = clip(item.planTitle, 24)
  return `  - ${status} ${goal} — ${clip(item.label, 60)}`
}

function formatTaskTier(title: string, items: AggregatedItem[]): string[] {
  if (!items.length) return []
  const lines = [`${title} (${items.filter((i) => i.done).length}/${items.length})`]
  const visible = items.slice(0, MAX_TASKS_PER_TIER)
  for (const item of visible) lines.push(formatTaskLine(item))
  if (items.length > MAX_TASKS_PER_TIER) {
    lines.push(`  - …외 ${items.length - MAX_TASKS_PER_TIER}개`)
  }
  return lines
}

function aggregateHomeBoard(now: Date): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const plans = readGoalPlansLite()
  const goalAgg = aggregateForDate(plans, now)
  const owner = readOwnerId()
  const miscAgg = owner ? miscAggregatedLite(readMiscTodosLite(owner), now) : { daily: [], weekly: [], monthly: [] }

  return {
    daily: [...goalAgg.daily, ...miscAgg.daily],
    weekly: [...goalAgg.weekly, ...miscAgg.weekly],
    monthly: [...goalAgg.monthly, ...miscAgg.monthly],
  }
}

/**
 * 미래의 나 프롬프트용 홈 계획표 전체 요약.
 * 최종 목표·동기 3문항·오늘/주/월 할 일(항목별 완료 여부)을 포함한다.
 */
export function describeGoalBoardForPrompt(now = new Date()): string {
  const plans = readGoalPlansLite()
  const board = aggregateHomeBoard(now)
  const hasTasks = board.daily.length + board.weekly.length + board.monthly.length > 0
  const hasPlans = plans.some((p) => p.title?.trim())

  if (!hasPlans && !hasTasks) return ''

  const lines: string[] = []
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일`
  lines.push(`홈 계획표 (${dateLabel} 기준)`)

  for (const plan of plans.slice(0, MAX_PLANS)) {
    if (!plan?.title?.trim()) continue
    const dday = plan.intake?.deadline ? daysUntilDeadline(plan.intake.deadline, now) : null
    const ddayLabel = dday == null ? '' : dday >= 0 ? ` (D-${dday})` : ` (마감 ${-dday}일 지남)`
    lines.push(`최종 목표: "${clip(plan.title, 50)}"${ddayLabel}`)
    lines.push(...describeMotivation(plan))
  }

  if (plans.length > MAX_PLANS) {
    lines.push(`…외 최종 목표 ${plans.length - MAX_PLANS}개`)
  }

  lines.push(...formatTaskTier('오늘 할 일', board.daily))
  lines.push(...formatTaskTier('이번 주', board.weekly))
  lines.push(...formatTaskTier('이번 달', board.monthly))

  return lines.join('\n')
}
