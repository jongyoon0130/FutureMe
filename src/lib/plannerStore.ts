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
