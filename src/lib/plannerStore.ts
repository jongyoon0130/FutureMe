import type {
  CompletionReflection,
  Goal,
  Milestone,
  PlanTask,
  PlannerData,
  SelfProfile,
  TaskPriority,
} from '../types/self'
import { emptyPlanner, normalizePlanner } from '../types/self'

const now = () => Date.now()

export function plannerOf(profile: SelfProfile): PlannerData {
  return normalizePlanner(profile.planner)
}

function replacePlanner(profile: SelfProfile, planner: PlannerData): SelfProfile {
  return { ...profile, planner }
}

export type NewGoal = Pick<Goal, 'title' | 'purpose' | 'desiredOutcome' | 'futureConnection' | 'domain' | 'horizon' | 'startDate' | 'targetDate'>

export function addGoal(profile: SelfProfile, input: NewGoal): SelfProfile {
  const title = input.title.trim()
  if (!title || !input.targetDate) return profile
  const planner = plannerOf(profile)
  const at = now()
  const goal: Goal = { id: crypto.randomUUID(), ...input, title, purpose: input.purpose.trim(), desiredOutcome: input.desiredOutcome.trim(), futureConnection: input.futureConnection.trim(), status: 'active', createdAt: at, updatedAt: at }
  return replacePlanner(profile, { ...planner, goals: [goal, ...planner.goals] })
}

export function updateGoal(profile: SelfProfile, id: string, patch: Partial<Omit<Goal, 'id' | 'createdAt'>>): SelfProfile {
  const planner = plannerOf(profile)
  return replacePlanner(profile, { ...planner, goals: planner.goals.map((g) => g.id === id ? { ...g, ...patch, updatedAt: now() } : g) })
}

export function addMilestone(profile: SelfProfile, input: Pick<Milestone, 'goalId' | 'title' | 'targetDate'>): SelfProfile {
  if (!input.title.trim()) return profile
  const planner = plannerOf(profile)
  const at = now()
  const milestone: Milestone = { id: crypto.randomUUID(), goalId: input.goalId, title: input.title.trim(), targetDate: input.targetDate, done: false, createdAt: at, updatedAt: at }
  return replacePlanner(profile, { ...planner, milestones: [...planner.milestones, milestone] })
}

export type NewTask = Pick<PlanTask, 'title' | 'goalId' | 'milestoneId' | 'scheduledFor' | 'estimatedMinutes' | 'priority'>

export function addPlanTask(profile: SelfProfile, input: NewTask): SelfProfile {
  if (!input.title.trim()) return profile
  const planner = plannerOf(profile)
  const at = now()
  const task: PlanTask = { id: crypto.randomUUID(), title: input.title.trim(), goalId: input.goalId, milestoneId: input.milestoneId, scheduledFor: input.scheduledFor, estimatedMinutes: input.estimatedMinutes, priority: input.priority, status: 'todo', createdAt: at, updatedAt: at }
  return replacePlanner(profile, { ...planner, tasks: [task, ...planner.tasks] })
}

export function updatePlanTask(profile: SelfProfile, id: string, patch: Partial<Omit<PlanTask, 'id' | 'createdAt'>>): SelfProfile {
  const planner = plannerOf(profile)
  return replacePlanner(profile, { ...planner, tasks: planner.tasks.map((t) => t.id === id ? { ...t, ...patch, updatedAt: now() } : t) })
}

export function completePlanTask(profile: SelfProfile, id: string): SelfProfile {
  return updatePlanTask(profile, id, { status: 'done', completedAt: now() })
}

export function reopenPlanTask(profile: SelfProfile, id: string): SelfProfile {
  return updatePlanTask(profile, id, { status: 'todo', completedAt: undefined })
}

export function postponePlanTask(profile: SelfProfile, id: string, scheduledFor: string): SelfProfile {
  return updatePlanTask(profile, id, { scheduledFor, status: 'todo' })
}

export function deletePlanTask(profile: SelfProfile, id: string): SelfProfile {
  const planner = plannerOf(profile)
  return replacePlanner(profile, { ...planner, tasks: planner.tasks.filter((t) => t.id !== id), reflections: planner.reflections.filter((r) => r.taskId !== id) })
}

export function addCompletionReflection(profile: SelfProfile, input: Omit<CompletionReflection, 'id' | 'createdAt'>): SelfProfile {
  const planner = plannerOf(profile)
  if (!planner.tasks.some((t) => t.id === input.taskId)) return profile
  const reflection: CompletionReflection = { id: crypto.randomUUID(), ...input, emotion: input.emotion.trim() || '해냈어', pride: input.pride?.trim(), learning: input.learning?.trim(), futureCloseness: input.futureCloseness?.trim(), createdAt: now() }
  return replacePlanner(profile, { ...planner, reflections: [reflection, ...planner.reflections] })
}

export function tasksForDate(profile: SelfProfile, date: string): PlanTask[] {
  return plannerOf(profile).tasks.filter((t) => t.scheduledFor === date && t.status !== 'skipped')
}

export function dateKey(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function nextDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return dateKey(d)
}

export function weekDates(anchor = new Date()): string[] {
  const d = new Date(anchor)
  const diff = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - diff)
  return Array.from({ length: 7 }, (_, i) => nextDate(dateKey(d), i))
}

export const PRIORITY_LABELS: Record<TaskPriority, string> = { must: '꼭', should: '하면 좋음', could: '여유되면' }

export const EMPTY_PLANNER = emptyPlanner

// ---------------------------------------------------------------------------
// 실행 리듬 읽기 — "못 해낸 날"과 "멈춘 목표"를 알아채기 위한 순수 함수들.
// 플래너 UI(위로 카드)와 미래의 나 프롬프트(부드러운 회상)가 함께 쓴다.
// ---------------------------------------------------------------------------

/** 기한이 지났는데 아직 안 한 할 일 (오래된 것부터) */
export function overdueTasks(profile: SelfProfile, today: string): PlanTask[] {
  return plannerOf(profile)
    .tasks.filter((t) => t.status === 'todo' && !!t.scheduledFor && t.scheduledFor < today)
    .sort((a, b) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
}

const DAY_MS = 24 * 60 * 60 * 1000

export type StalledGoal = { goal: Goal; stalledDays: number }

/**
 * 멈춘 목표 — 연결된 할 일의 마지막 움직임(생성·완료·수정)이
 * thresholdDays 이상 지난 활성 목표. 움직임이 아예 없으면 목표 생성일 기준.
 */
export function stalledGoals(profile: SelfProfile, now = Date.now(), thresholdDays = 5): StalledGoal[] {
  const planner = plannerOf(profile)
  const result: StalledGoal[] = []
  for (const goal of planner.goals) {
    if (goal.status !== 'active') continue
    let lastActivity = goal.createdAt
    for (const t of planner.tasks) {
      if (t.goalId !== goal.id) continue
      lastActivity = Math.max(lastActivity, t.updatedAt, t.completedAt ?? 0, t.createdAt)
    }
    const stalledDays = Math.floor((now - lastActivity) / DAY_MS)
    if (stalledDays >= thresholdDays) result.push({ goal, stalledDays })
  }
  return result.sort((a, b) => b.stalledDays - a.stalledDays)
}

export type CompletionStats = { done: number; overdue: number }

/** 최근 N일의 완료 개수 + 현재 밀린 할 일 개수 — AI 초안이 현실 용량을 알게 */
export function completionStats(profile: SelfProfile, today: string, days = 14, now = Date.now()): CompletionStats {
  const planner = plannerOf(profile)
  const since = now - days * DAY_MS
  const done = planner.tasks.filter((t) => t.status === 'done' && (t.completedAt ?? 0) >= since).length
  return { done, overdue: overdueTasks(profile, today).length }
}

/** 최근 완료 회고 (해당 task 제목 포함) — 미래의 나가 회상할 재료 */
export function recentReflectionsWithTask(
  profile: SelfProfile,
  limit = 2,
): { taskTitle: string; emotion: string; pride?: string; createdAt: number }[] {
  const planner = plannerOf(profile)
  const taskById = new Map(planner.tasks.map((t) => [t.id, t]))
  return planner.reflections.slice(0, limit).map((r) => ({
    taskTitle: taskById.get(r.taskId)?.title ?? '해낸 일',
    emotion: r.emotion,
    pride: r.pride,
    createdAt: r.createdAt,
  }))
}
